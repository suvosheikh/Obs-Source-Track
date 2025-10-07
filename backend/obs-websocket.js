const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/obs_tracker.db');
const db = new sqlite3.Database(dbPath);

const OBS_CONFIG = {
    host: '192.168.0.108',
    port: 4455,
    password: ''
};

let obsWs = null;
const activeSources = new Map();
const sourceSessions = new Map();
let isIdentified = false;

// Import broadcast function
const { broadcastToFrontend } = require('./server');

function connectToOBS() {
    try {
        console.log('🔄 Connecting to OBS WebSocket...');
        
        obsWs = new WebSocket(`ws://${OBS_CONFIG.host}:${OBS_CONFIG.port}`);
        
        obsWs.on('open', () => {
            console.log('✅ Connected to OBS WebSocket');
        });

        obsWs.on('message', (data) => {
            try {
                const parsedData = JSON.parse(data);
                handleOBSMessage(parsedData);
            } catch (error) {
                console.error('Error parsing OBS message:', error);
            }
        });

        obsWs.on('close', (event) => {
            console.log(`🔌 OBS WebSocket connection closed: ${event}`);
            isIdentified = false;
            activeSources.clear();
            sourceSessions.clear();
            setTimeout(connectToOBS, 5000);
        });

        obsWs.on('error', (error) => {
            console.error('❌ OBS WebSocket error:', error);
        });

    } catch (error) {
        console.error('Failed to connect to OBS:', error);
        setTimeout(connectToOBS, 5000);
    }
}

function handleOBSMessage(data) {
    if (!data || !data.op) {
        console.log('📨 Invalid OBS message:', data);
        return;
    }

    console.log('📨 OBS Message op:', data.op);

    switch (data.op) {
        case 0: // Hello
            handleHello(data);
            break;
        case 2: // Identified
            handleIdentified(data);
            break;
        case 5: // Event
            handleEvent(data);
            break;
        case 7: // RequestResponse
            handleRequestResponse(data);
            break;
        default:
            console.log('📨 Unknown OBS message op:', data.op);
    }
}

function handleHello(data) {
    console.log('👋 OBS Hello received');
    
    const identifyMessage = {
        "op": 1,
        "d": {
            "rpcVersion": 1,
            "eventSubscriptions": 1 | 16 | 32, // General + Scenes + SceneItems
        }
    };

    console.log('🔑 Sending Identify message...');
    obsWs.send(JSON.stringify(identifyMessage));
}

function handleIdentified(data) {
    console.log('✅ Successfully identified with OBS');
    isIdentified = true;
    
    // Get current scene to start tracking
    getCurrentScene();
}

function handleEvent(data) {
    if (!data.d || !data.d.eventType) {
        console.log('📨 Invalid event data:', data);
        return;
    }

    const eventType = data.d.eventType;
    const eventData = data.d.eventData;

    console.log(`📢 OBS Event: ${eventType}`);

    // Track source visibility changes
    if (eventType === 'SceneItemEnableStateChanged') {
        const sourceName = eventData.sceneItemName;
        const isVisible = eventData.sceneItemEnabled;
        
        console.log(`🔧 Source: ${sourceName} - ${isVisible ? 'VISIBLE' : 'HIDDEN'}`);
        handleSourceVisibilityChange(sourceName, isVisible);
    }
    else if (eventType === 'CurrentProgramSceneChanged') {
        console.log(`🔄 Scene changed to: ${eventData.sceneName}`);
        // We don't need scene changes for direct source tracking
    }
}

function handleRequestResponse(data) {
    if (!data.d || !data.d.requestType) {
        return;
    }

    const requestType = data.d.requestType;
    const responseData = data.d.responseData;

    if (requestType === 'GetCurrentProgramScene' && responseData) {
        console.log(`🎬 Current Scene: ${responseData.sceneName}`);
        getSceneSources(responseData.sceneName);
    }
    else if (requestType === 'GetSceneItemList' && responseData) {
        console.log(`📋 Found ${responseData.sceneItems.length} sources in scene`);
        responseData.sceneItems.forEach(item => {
            console.log(`   - ${item.sourceName}: ${item.sceneItemEnabled ? 'VISIBLE' : 'HIDDEN'}`);
            handleSourceVisibilityChange(item.sourceName, item.sceneItemEnabled);
        });
    }
}

function sendRequest(requestType, requestData = {}) {
    return new Promise((resolve, reject) => {
        if (!obsWs || obsWs.readyState !== WebSocket.OPEN || !isIdentified) {
            reject(new Error('WebSocket not ready'));
            return;
        }

        const messageId = `req_${Date.now()}`;
        const message = {
            "op": 6,
            "d": {
                "requestType": requestType,
                "requestId": messageId,
                "requestData": requestData
            }
        };

        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 3000);

        const messageHandler = (eventData) => {
            try {
                const response = JSON.parse(eventData);
                if (response.op === 7 && response.d.requestId === messageId) {
                    clearTimeout(timeout);
                    obsWs.off('message', messageHandler);
                    
                    if (response.d.requestStatus.result) {
                        resolve(response.d.responseData);
                    } else {
                        reject(new Error(response.d.requestStatus.code));
                    }
                }
            } catch (error) {
                // Ignore parsing errors
            }
        };

        obsWs.on('message', messageHandler);
        obsWs.send(JSON.stringify(message));
    });
}

function getCurrentScene() {
    console.log('🚀 Getting current scene...');
    
    sendRequest('GetCurrentProgramScene')
        .then(sceneData => {
            console.log('🎯 Source tracking started!');
        })
        .catch(error => {
            console.log('⚠️  GetCurrentProgramScene failed:', error.message);
        });
}

function getSceneSources(sceneName) {
    sendRequest('GetSceneItemList', { sceneName: sceneName })
        .catch(error => {
            console.log('⚠️  GetSceneItemList failed:', error.message);
        });
}

function handleSourceVisibilityChange(sourceName, isVisible) {
    const currentDate = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();

    console.log(`👁️ ${isVisible ? 'SHOWING' : 'HIDING'}: ${sourceName}`);

    if (isVisible) {
        if (!activeSources.has(sourceName)) {
            activeSources.set(sourceName, timestamp);
            sourceSessions.set(sourceName, Date.now());
            console.log(`✅ ADDED to active: ${sourceName}`);
            
            updateSourceInDatabase(sourceName, true, timestamp);
        }
    } else {
        if (activeSources.has(sourceName)) {
            const sessionStart = sourceSessions.get(sourceName);
            const duration = Math.floor((Date.now() - sessionStart) / 1000);
            
            activeSources.delete(sourceName);
            sourceSessions.delete(sourceName);
            console.log(`🚫 REMOVED from active: ${sourceName}, Duration: ${duration}s`);
            
            updateSourceInDatabase(sourceName, false, timestamp, duration);
        }
    }
    
    console.log(`📊 Active sources: ${Array.from(activeSources.keys())}`);
}

function updateSourceInDatabase(sourceName, isVisible, timestamp, duration = 0) {
    const currentDate = new Date().toISOString().split('T')[0];

    if (isVisible) {
        db.get(
            `SELECT * FROM source_log WHERE date = ? AND source_name = ?`,
            [currentDate, sourceName],
            (err, row) => {
                if (err) {
                    console.error('Database error:', err);
                    return;
                }

                if (row) {
                    db.run(
                        `UPDATE source_log 
                         SET visible_count = visible_count + 1, 
                             last_visible_at = ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE date = ? AND source_name = ?`,
                        [timestamp, currentDate, sourceName],
                        (err) => {
                            if (err) console.error('Update error:', err);
                            else {
                                console.log(`💾 UPDATED ${sourceName} in database`);
                                triggerFrontendUpdate();
                            }
                        }
                    );
                } else {
                    db.run(
                        `INSERT INTO source_log (date, source_name, visible_count, last_visible_at)
                         VALUES (?, ?, 1, ?)`,
                        [currentDate, sourceName, timestamp],
                        (err) => {
                            if (err) console.error('Insert error:', err);
                            else {
                                console.log(`💾 INSERTED ${sourceName} in database`);
                                triggerFrontendUpdate();
                            }
                        }
                    );
                }
            }
        );
    } else {
        db.run(
            `UPDATE source_log 
             SET total_duration = total_duration + ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE date = ? AND source_name = ?`,
            [duration, currentDate, sourceName],
            (err) => {
                if (err) console.error('Duration update error:', err);
                else {
                    console.log(`💾 UPDATED duration for ${sourceName}: ${duration}s`);
                    triggerFrontendUpdate();
                }
            }
        );
    }
}

function triggerFrontendUpdate() {
    // Get current data and broadcast
    const currentDate = new Date().toISOString().split('T')[0];
    db.all('SELECT * FROM source_log WHERE date = ? ORDER BY last_visible_at DESC', [currentDate], (err, rows) => {
        if (err) {
            console.error('Error getting data for broadcast:', err);
            return;
        }
        
        const message = JSON.stringify({ 
            type: 'source_updated', 
            message: 'Source data updated',
            data: rows,
            activeSources: Array.from(activeSources.keys()),
            timestamp: new Date().toISOString()
        });
        
        broadcastToFrontend(message);
        console.log('📢 Broadcasted to frontend');
        console.log(`📊 Data: ${rows.length} sources, Active: ${activeSources.size}`);
    });
}

// Start connection
connectToOBS();

module.exports = { obsWs };
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const http = require('http');

// Database setup - COMPLETELY FIXED
const dbPath = path.join(__dirname, '../database/obs_tracker.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // Create source_log table
        db.run(`CREATE TABLE IF NOT EXISTS source_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            source_name TEXT NOT NULL,
            visible_count INTEGER DEFAULT 0,
            total_duration INTEGER DEFAULT 0,
            last_visible_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('❌ Error creating source_log table:', err);
                reject(err);
                return;
            }
            console.log('✅ source_log table ready');
            
            // Create source_metadata table
            db.run(`CREATE TABLE IF NOT EXISTS source_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_name TEXT UNIQUE NOT NULL,
                title TEXT,
                category TEXT,
                brand TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('❌ Error creating source_metadata table:', err);
                    reject(err);
                    return;
                }
                console.log('✅ source_metadata table ready');
                resolve();
            });
        });
    });
}

// Initialize database first
initializeDatabase().then(() => {
    console.log('✅ Database initialized successfully');
    startServer();
}).catch(error => {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
});

function startServer() {
    console.log('🚀 Starting server...');

    // WebSocket server for frontend
    const wss = new WebSocket.Server({ port: 8080 });
    const frontendClients = new Set();

    wss.on('connection', function connection(ws) {
        console.log('🔗 Frontend client connected');
        frontendClients.add(ws);
        
        ws.on('close', () => {
            console.log('🔌 Frontend client disconnected');
            frontendClients.delete(ws);
        });
        
        ws.on('error', (error) => {
            console.error('❌ Frontend WebSocket error:', error);
            frontendClients.delete(ws);
        });
        
        sendInitialData(ws);
    });

    console.log('🔄 WebSocket server running on port 8080');

    function broadcastToFrontend(data) {
        const message = JSON.stringify(data);
        frontendClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    function sendInitialData(ws) {
        const currentDate = getCurrentDate();
        db.all('SELECT * FROM source_log WHERE date = ? ORDER BY last_visible_at DESC', [currentDate], (err, rows) => {
            if (!err && rows) {
                ws.send(JSON.stringify({
                    type: 'initial_data',
                    data: rows,
                    activeSources: Array.from(activeSources.keys()),
                    timestamp: new Date().toISOString()
                }));
            }
        });
    }

    // OBS WebSocket connection
    const OBS_CONFIG = {
        host: '192.168.111.80',
        port: 4455,
        password: ''
    };

    let obsWs = null;
    const activeSources = new Map();
    const sourceSessions = new Map();
    let isIdentified = false;

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
                    console.error('❌ Error parsing OBS message:', error);
                }
            });

            obsWs.on('close', () => {
                console.log('🔌 OBS WebSocket connection closed');
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
        if (!data || typeof data.op === 'undefined') {
            return;
        }

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
        }
    }

    function handleHello(data) {
        console.log('👋 OBS Hello received');
        
        const identifyMessage = {
            "op": 1,
            "d": {
                "rpcVersion": 1,
                "eventSubscriptions": (1 << 0) | (1 << 1) | (1 << 4) | (1 << 5),
            }
        };

        console.log('🔑 Sending Identify message...');
        obsWs.send(JSON.stringify(identifyMessage));
    }

    function handleIdentified(data) {
        console.log('✅ Successfully identified with OBS');
        isIdentified = true;
        startManualPolling();
    }

    function handleEvent(data) {
        if (!data.d || !data.d.eventType) {
            return;
        }
        console.log(`🎯 OBS Event: ${data.d.eventType}`);
    }

    function handleRequestResponse(data) {
        if (!data.d || !data.d.requestType) {
            return;
        }

        const requestType = data.d.requestType;
        const responseData = data.d.responseData;

        try {
            if (requestType === 'GetSceneList' && responseData && responseData.scenes) {
                responseData.scenes.forEach(scene => {
                    if (scene && scene.sceneName) {
                        getSceneSources(scene.sceneName);
                    }
                });
            }
            else if (requestType === 'GetSceneItemList' && responseData && responseData.sceneItems) {
                responseData.sceneItems.forEach(item => {
                    if (item && item.sourceName) {
                        handleSourceVisibilityChange(item.sourceName, item.sceneItemEnabled);
                    }
                });
            }
        } catch (error) {
            console.error(`❌ Error handling request ${requestType}:`, error.message);
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

    function startManualPolling() {
        console.log('🔄 Starting manual polling for sources...');
        
        setInterval(() => {
            if (isIdentified) {
                pollAllSources();
            }
        }, 2000);
        
        setTimeout(() => {
            pollAllSources();
        }, 1000);
    }

    function pollAllSources() {
        sendRequest('GetSceneList')
            .then(sceneList => {
                if (sceneList && sceneList.scenes) {
                    sceneList.scenes.forEach(scene => {
                        if (scene && scene.sceneName) {
                            getSceneSources(scene.sceneName);
                        }
                    });
                }
            })
            .catch(error => {
                console.log('❌ GetSceneList failed:', error.message);
            });
    }

    function getSceneSources(sceneName) {
        sendRequest('GetSceneItemList', { sceneName: sceneName })
            .then(sceneData => {
                if (sceneData && sceneData.sceneItems) {
                    sceneData.sceneItems.forEach(item => {
                        if (item && item.sourceName) {
                            handleSourceVisibilityChange(item.sourceName, item.sceneItemEnabled);
                        }
                    });
                }
            })
            .catch(error => {
                // Ignore errors
            });
    }

    function handleSourceVisibilityChange(sourceName, isVisible) {
        const currentDate = getCurrentDate();
        const timestamp = new Date().toISOString();

        if (isVisible) {
            if (!activeSources.has(sourceName)) {
                activeSources.set(sourceName, timestamp);
                sourceSessions.set(sourceName, Date.now());
                console.log(`✅ SOURCE ACTIVE: ${sourceName}`);
                updateSourceInDatabase(sourceName, true, timestamp);
            }
        } else {
            if (activeSources.has(sourceName)) {
                const sessionStart = sourceSessions.get(sourceName);
                const duration = Math.floor((Date.now() - sessionStart) / 1000);
                activeSources.delete(sourceName);
                sourceSessions.delete(sourceName);
                console.log(`🚫 SOURCE INACTIVE: ${sourceName}, Duration: ${duration}s`);
                updateSourceInDatabase(sourceName, false, timestamp, duration);
            }
        }
    }

    function updateSourceInDatabase(sourceName, isVisible, timestamp, duration = 0) {
        const currentDate = getCurrentDate();

        if (isVisible) {
            db.get(
                `SELECT * FROM source_log WHERE date = ? AND source_name = ?`,
                [currentDate, sourceName],
                (err, row) => {
                    if (err) return;

                    if (row) {
                        db.run(
                            `UPDATE source_log 
                             SET visible_count = visible_count + 1, 
                                 last_visible_at = ?
                             WHERE date = ? AND source_name = ?`,
                            [timestamp, currentDate, sourceName],
                            (err) => {
                                if (!err) {
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
                                if (!err) {
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
                 SET total_duration = total_duration + ?
                 WHERE date = ? AND source_name = ?`,
                [duration, currentDate, sourceName],
                (err) => {
                    if (!err) {
                        triggerFrontendUpdate();
                    }
                }
            );
        }
    }

    function triggerFrontendUpdate() {
        const currentDate = getCurrentDate();
        db.all(`
            SELECT sl.*, sm.title, sm.category, sm.brand 
            FROM source_log sl 
            LEFT JOIN source_metadata sm ON sl.source_name = sm.source_name 
            WHERE sl.date = ? 
            ORDER BY sl.last_visible_at DESC
        `, [currentDate], (err, rows) => {
            if (!err) {
                broadcastToFrontend({ 
                    type: 'source_updated', 
                    data: rows,
                    activeSources: Array.from(activeSources.keys()),
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    function getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }

    // HTTP server with all API endpoints
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`🌐 ${req.method} ${req.url}`);
        
        // API Routes
        if (req.url === '/api/sources' && req.method === 'GET') {
            const currentDate = getCurrentDate();
            db.all(`
                SELECT sl.*, sm.title, sm.category, sm.brand 
                FROM source_log sl 
                LEFT JOIN source_metadata sm ON sl.source_name = sm.source_name 
                WHERE sl.date = ? 
                ORDER BY sl.last_visible_at DESC
            `, [currentDate], (err, rows) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(rows));
            });
        }
        else if (req.url === '/api/active' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                activeSources: Array.from(activeSources.keys()),
                totalActive: activeSources.size,
                isOBSConnected: isIdentified
            }));
        }
        else if (req.url === '/api/metadata' && req.method === 'GET') {
            db.all('SELECT * FROM source_metadata ORDER BY source_name', [], (err, rows) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(rows));
            });
        }
        else if (req.url === '/api/metadata' && req.method === 'POST') {
            let body = '';
            
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    
                    if (!data.source_name || !data.title || !data.category) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing required fields: source_name, title, category' }));
                        return;
                    }
                    
                    db.run(
                        `INSERT OR REPLACE INTO source_metadata 
                         (source_name, title, category, brand) 
                         VALUES (?, ?, ?, ?)`,
                        [data.source_name, data.title, data.category, data.brand || ''],
                        function(err) {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: err.message }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: true, 
                                    id: this.lastID,
                                    message: `Metadata for ${data.source_name} created successfully`
                                }));
                                triggerFrontendUpdate();
                            }
                        }
                    );
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON format' }));
                }
            });
        }
        else if (req.url.startsWith('/api/metadata/') && req.method === 'PUT') {
            const urlParts = req.url.split('/');
            const sourceName = decodeURIComponent(urlParts[urlParts.length - 1]);
            let body = '';
            
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    
                    db.run(
                        `UPDATE source_metadata 
                         SET title = ?, category = ?, brand = ?
                         WHERE source_name = ?`,
                        [data.title, data.category, data.brand || '', sourceName],
                        function(err) {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: err.message }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: true, 
                                    changes: this.changes,
                                    message: `Metadata for ${sourceName} updated successfully`
                                }));
                                triggerFrontendUpdate();
                            }
                        }
                    );
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON format' }));
                }
            });
        }
        else if (req.url.startsWith('/api/metadata/') && req.method === 'DELETE') {
            const urlParts = req.url.split('/');
            const sourceName = decodeURIComponent(urlParts[urlParts.length - 1]);
            
            db.run(
                'DELETE FROM source_metadata WHERE source_name = ?',
                [sourceName],
                function(err) {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: true, 
                            changes: this.changes,
                            message: `Metadata for ${sourceName} deleted successfully`
                        }));
                        triggerFrontendUpdate();
                    }
                }
            );
        }
        else if (req.url === '/api/reports/dates' && req.method === 'GET') {
            db.all('SELECT DISTINCT date FROM source_log ORDER BY date DESC', [], (err, rows) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
                const dates = rows.map(r => r.date);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(dates));
            });
        }
        else if (req.url.startsWith('/api/reports/daily') && req.method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const date = url.searchParams.get('date') || getCurrentDate();
            
            db.all(`
                SELECT sl.*, sm.title, sm.category, sm.brand 
                FROM source_log sl 
                LEFT JOIN source_metadata sm ON sl.source_name = sm.source_name 
                WHERE sl.date = ? 
                ORDER BY sl.visible_count DESC
            `, [date], (err, rows) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(rows));
            });
        }
        else if (req.url === '/api/force-update' && req.method === 'GET') {
            pollAllSources();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Manual update triggered' }));
        }
        else {
            serveFrontend(req, res);
        }
    });

    function serveFrontend(req, res) {
        let filePath = path.join(__dirname, '../frontend', req.url === '/' ? 'index.html' : req.url);
        
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(__dirname, '../frontend/index.html');
        }
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            let contentType = 'text/html';
            if (filePath.endsWith('.css')) contentType = 'text/css';
            if (filePath.endsWith('.js')) contentType = 'application/javascript';
            if (filePath.endsWith('.png')) contentType = 'image/png';
            if (filePath.endsWith('.ico')) contentType = 'image/x-icon';
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    }

    server.listen(3000, () => {
        console.log('🚀 Server running on http://localhost:3000');
    });

    // Start OBS connection
    connectToOBS();
}
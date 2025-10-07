const WebSocket = require('ws');

console.log('🔌 Testing OBS WebSocket connection manually...');

const ws = new WebSocket('ws://192.168.0.108:4455');

ws.on('open', function open() {
    console.log('✅ Connected to OBS WebSocket');
});

ws.on('message', function message(data) {
    const parsed = JSON.parse(data);
    console.log('📨 Received op:', parsed.op);
    console.log('Full message:', JSON.stringify(parsed, null, 2));
    
    if (parsed.op === 0) { // Hello
        console.log('👋 Hello received, sending Identify...');
        const identify = {
            "op": 1,
            "d": {
                "rpcVersion": 1,
                "eventSubscriptions": 49
            }
        };
        ws.send(JSON.stringify(identify));
    }
});

ws.on('close', function close() {
    console.log('🔌 Connection closed');
});

ws.on('error', function error(err) {
    console.error('❌ Connection error:', err);
});
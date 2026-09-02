// ============================================
// WEB OBS BACKEND SERVER
// Supports RTMP Streaming to Twitch, YouTube, etc.
// ============================================

const express = require('express');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================
// RTMP SERVER CONFIGURATION
// ============================================

const rtmpConfig = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8000,
        allow_origin: '*'
    },
    trans: {
        ffmpeg: '/usr/bin/ffmpeg',
        tasks: [
            {
                app: 'live',
                hls: true,
                hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
                dash: true,
                dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
            }
        ]
    },
    relay: {
        app: 'live',
        mode: 'push',
        // This is where you configure where to push the stream
        // The stream key from the frontend will be used to determine the destination
        on_publish: (id, StreamPath, args) => {
            console.log(`📡 Stream published: ${StreamPath}`);
            console.log(`🔑 Stream key: ${args.streamKey || 'No key provided'}`);
            return true;
        }
    }
};

// Create RTMP server
const nms = new NodeMediaServer(rtmpConfig);

// ============================================
// RTMP SERVER EVENTS
// ============================================

nms.on('prePublish', (id, StreamPath, args) => {
    console.log(`🎥 Stream starting: ${StreamPath}`);
    console.log(`📊 Stream details:`, args);
    
    // Broadcast to all WebSocket clients that stream started
    broadcastToClients({
        type: 'stream_started',
        streamPath: StreamPath,
        streamKey: args.streamKey || 'unknown'
    });
});

nms.on('postPublish', (id, StreamPath, args) => {
    console.log(`⏹️ Stream ended: ${StreamPath}`);
    
    // Broadcast to all WebSocket clients that stream ended
    broadcastToClients({
        type: 'stream_ended',
        streamPath: StreamPath
    });
});

nms.on('prePlay', (id, StreamPath, args) => {
    console.log(`👁️ Viewer connected: ${StreamPath}`);
});

nms.on('postPlay', (id, StreamPath, args) => {
    console.log(`👋 Viewer disconnected: ${StreamPath}`);
});

// ============================================
// WEBSOCKET SERVER FOR REAL-TIME COMMUNICATION
// ============================================

let clients = [];

function broadcastToClients(data) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('🔗 New WebSocket connection');
    clients.push(ws);
    
    // Send initial status
    ws.send(JSON.stringify({
        type: 'status',
        status: 'connected',
        message: 'Connected to Web OBS server'
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 Received:', data);
            
            // Handle different message types
            switch(data.type) {
                case 'start_stream':
                    handleStartStream(ws, data);
                    break;
                case 'stop_stream':
                    handleStopStream(ws, data);
                    break;
                case 'get_status':
                    handleGetStatus(ws);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        clients = clients.filter(client => client !== ws);
    });
});

// ============================================
// STREAM HANDLERS
// ============================================

function handleStartStream(ws, data) {
    const { streamKey, platform, streamTitle, streamCategory } = data;
    
    console.log(`🚀 Starting stream to ${platform}`);
    console.log(`📝 Title: ${streamTitle}`);
    console.log(`🏷️ Category: ${streamCategory}`);
    
    // Validate stream key format
    if (!streamKey || streamKey.length < 8) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid stream key. Please check your stream key.'
        }));
        return;
    }
    
    // Determine RTMP URL based on platform
    let rtmpUrl = getRTMPUrl(platform, streamKey);
    
    ws.send(JSON.stringify({
        type: 'stream_started',
        platform: platform,
        streamKey: streamKey,
        rtmpUrl: rtmpUrl,
        message: `Stream started on ${platform}`
    }));
    
    // Broadcast to all clients
    broadcastToClients({
        type: 'stream_status',
        status: 'live',
        platform: platform,
        title: streamTitle
    });
}

function handleStopStream(ws, data) {
    console.log('⏹️ Stopping stream');
    
    ws.send(JSON.stringify({
        type: 'stream_stopped',
        message: 'Stream stopped successfully'
    }));
    
    broadcastToClients({
        type: 'stream_status',
        status: 'offline'
    });
}

function handleGetStatus(ws) {
    ws.send(JSON.stringify({
        type: 'status',
        status: 'ready',
        message: 'Server is ready',
        rtmpPort: 1935,
        httpPort: 8000
    }));
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getRTMPUrl(platform, streamKey) {
    const rtmpUrls = {
        'twitch': `rtmp://live.twitch.tv/app/${streamKey}`,
        'youtube': `rtmp://a.rtmp.youtube.com/live2/${streamKey}`,
        'tiktok': `rtmp://live.tiktok.com/live/${streamKey}`,
        'facebook': `rtmp://live.facebook.com/live/${streamKey}`,
        'custom': streamKey // For custom RTMP, just use the key as the URL
    };
    
    return rtmpUrls[platform] || rtmpUrls['twitch'];
}

// ============================================
// EXPRESS SERVER (for serving frontend)
// ============================================

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API endpoints
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        rtmpPort: 1935,
        httpPort: 8000,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/stream/start', express.json(), (req, res) => {
    const { streamKey, platform, streamTitle, streamCategory } = req.body;
    
    if (!streamKey) {
        return res.status(400).json({
            error: 'Stream key is required'
        });
    }
    
    const rtmpUrl = getRTMPUrl(platform, streamKey);
    
    res.json({
        success: true,
        platform: platform,
        rtmpUrl: rtmpUrl,
        message: 'Stream started successfully'
    });
});

app.post('/api/stream/stop', (req, res) => {
    res.json({
        success: true,
        message: 'Stream stopped'
    });
});

// ============================================
// START THE SERVER
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log('========================================');
    console.log('🎥 Web OBS Server Started!');
    console.log('========================================');
    console.log(`🌐 HTTP Server: http://localhost:${PORT}`);
    console.log(`📡 RTMP Server: rtmp://localhost:1935`);
    console.log(`🔗 WebSocket: ws://localhost:${PORT}`);
    console.log('========================================');
    console.log('📋 Instructions:');
    console.log('1. Open http://localhost:3000 in your browser');
    console.log('2. Enter your stream key in Settings');
    console.log('3. Click "Start Streaming"');
    console.log('4. Use OBS or any RTMP client to stream to rtmp://localhost:1935/live');
    console.log('========================================');
    
    // Start RTMP server
    nms.run();
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    nms.stop();
    server.close(() => {
        console.log('👋 Server stopped');
        process.exit(0);
    });
});

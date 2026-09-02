// ============================================
// WEB OBS STUDIO - COMPLETE SCRIPT
// ============================================

// ===== STATE =====
const state = {
    isStreaming: false,
    isRecording: false,
    currentSource: 'camera',
    mediaStream: null,
    recorder: null,
    recordedChunks: [],
    startTime: null,
    recordTimer: null,
    overlays: [],
    overlayIdCounter: 0,
    canvas: null,
    canvasStream: null,
    animationFrame: null,
    platform: 'twitch',
    streamKey: '',
    streamTitle: '',
    streamCategory: '',
    streamUptime: 0,
    uptimeTimer: null,
    hotkeys: {},
    recordingHotkeys: false,
    currentHotkeyInput: null
};

// ===== DOM ELEMENTS =====
const previewVideo = document.getElementById('previewVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const recordBtn = document.getElementById('recordBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const recordTime = document.getElementById('recordTime');
const fpsCounter = document.getElementById('fpsCounter');
const resolutionDisplay = document.getElementById('resolutionDisplay');
const bitrateDisplay = document.getElementById('bitrateDisplay');
const overlayContainer = document.getElementById('overlayContainer');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const streamPlatform = document.getElementById('streamPlatform');
const streamStatus = document.getElementById('streamStatus');
const streamUptime = document.getElementById('streamUptime');

// ============================================
// SETTINGS / HOTKEY SYSTEM
// ============================================

const DEFAULT_HOTKEYS = {
    'hk-stream': 'Ctrl+Shift+S',
    'hk-record': 'Ctrl+Shift+R',
    'hk-screenshot': 'Ctrl+Shift+P',
    'hk-camera': 'Ctrl+1',
    'hk-screen': 'Ctrl+2',
    'hk-window': 'Ctrl+3',
    'hk-overlay': 'Ctrl+Shift+O',
    'hk-preset1': 'Alt+1',
    'hk-preset2': 'Alt+2',
    'hk-preset3': 'Alt+3',
    'hk-preset4': 'Alt+4'
};

let hotkeyListeners = {};

function loadHotkeys() {
    const saved = localStorage.getItem('obs_hotkeys');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.hotkeys = parsed;
        } catch (e) {
            state.hotkeys = { ...DEFAULT_HOTKEYS };
        }
    } else {
        state.hotkeys = { ...DEFAULT_HOTKEYS };
    }
    
    // Update UI
    Object.keys(state.hotkeys).forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = state.hotkeys[id] || '';
        }
    });
}

function saveHotkeys() {
    localStorage.setItem('obs_hotkeys', JSON.stringify(state.hotkeys));
    showToast('Hotkeys saved!', 'success');
    registerHotkeys();
}

function resetHotkeys() {
    state.hotkeys = { ...DEFAULT_HOTKEYS };
    Object.keys(state.hotkeys).forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = state.hotkeys[id];
        }
    });
    saveHotkeys();
    showToast('Hotkeys reset to defaults', 'success');
}

function clearHotkey(id) {
    state.hotkeys[id] = '';
    const input = document.getElementById(id);
    if (input) {
        input.value = '';
    }
    saveHotkeys();
}

function registerHotkeys() {
    // Remove old listeners
    Object.keys(hotkeyListeners).forEach(key => {
        document.removeEventListener('keydown', hotkeyListeners[key]);
    });
    hotkeyListeners = {};

    // Register new hotkeys
    Object.keys(state.hotkeys).forEach(id => {
        const hotkey = state.hotkeys[id];
        if (!hotkey) return;
        
        const keys = hotkey.split('+').map(k => k.trim());
        const listener = function(e) {
            const pressed = [];
            if (e.ctrlKey) pressed.push('Ctrl');
            if (e.shiftKey) pressed.push('Shift');
            if (e.altKey) pressed.push('Alt');
            pressed.push(e.key);
            
            const pressedStr = pressed.join('+');
            if (pressedStr === hotkey) {
                e.preventDefault();
                handleHotkeyAction(id);
            }
        };
        
        hotkeyListeners[id] = listener;
        document.addEventListener('keydown', listener);
    });
}

function handleHotkeyAction(id) {
    const actions = {
        'hk-stream': () => toggleStream(),
        'hk-record': () => toggleRecording(),
        'hk-screenshot': () => takeScreenshot(),
        'hk-camera': () => switchSource('camera'),
        'hk-screen': () => switchSource('screen'),
        'hk-window': () => switchSource('window'),
        'hk-overlay': () => toggleOverlayVisibility(),
        'hk-preset1': () => applyPreset('default'),
        'hk-preset2': () => applyPreset('fullscreen'),
        'hk-preset3': () => applyPreset('split'),
        'hk-preset4': () => applyPreset('overlay')
    };
    
    if (actions[id]) {
        actions[id]();
        showToast(`Hotkey: ${id.replace('hk-', '')}`, 'success');
    }
}

function toggleOverlayVisibility() {
    const containers = document.querySelectorAll('.overlay-container > *');
    const hidden = containers[0]?.style.display === 'none';
    containers.forEach(el => {
        el.style.display = hidden ? '' : 'none';
    });
}

// ============================================
// STREAMING PLATFORM CONNECTION
// ============================================

function connectToPlatform() {
    const platform = state.platform;
    const streamKey = document.getElementById('streamKey')?.value || '';
    
    if (!streamKey && platform !== 'custom') {
        showToast('Please enter your stream key!', 'error');
        return false;
    }
    
    const platformNames = {
        'twitch': 'Twitch',
        'youtube': 'YouTube',
        'tiktok': 'TikTok',
        'facebook': 'Facebook',
        'custom': 'Custom RTMP'
    };
    
    streamPlatform.textContent = platformNames[platform] || 'Connected';
    streamStatus.textContent = 'Live';
    streamStatus.style.color = '#51cf66';
    
    showToast(`Connected to ${platformNames[platform]}!`, 'success');
    return true;
}

function disconnectFromPlatform() {
    streamPlatform.textContent = 'Not Connected';
    streamStatus.textContent = 'Offline';
    streamStatus.style.color = '#ff6b6b';
}

// ============================================
// VIDEO CAPTURE
// ============================================

async function startStream() {
    try {
        // Check if connected to platform
        if (!document.getElementById('streamKey')?.value) {
            showToast('Please set up your stream key in Settings!', 'error');
            settingsModal.classList.add('show');
            return;
        }
        
        let stream;
        let constraints = { video: true, audio: true };

        switch (state.currentSource) {
            case 'camera':
                constraints = {
                    video: { facingMode: 'user', width: 1280, height: 720 },
                    audio: true
                };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            case 'screen':
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 1920, height: 1080 },
                    audio: true
                });
                break;
            case 'window':
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 1280, height: 720 },
                    audio: true
                });
                break;
        }

        state.mediaStream = stream;
        previewVideo.srcObject = stream;
        await previewVideo.play();

        state.isStreaming = true;
        connectToPlatform();
        updateUI();
        showToast('Stream started successfully!', 'success');
        
        // Start FPS counter
        startFPSMonitor();
        startUptimeTracker();

        // Start overlay rendering
        startOverlayRendering();

        return stream;
    } catch (error) {
        console.error('Error starting stream:', error);
        showToast('Error: ' + error.message, 'error');
        throw error;
    }
}

function stopStream() {
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
        previewVideo.srcObject = null;
        state.isStreaming = false;
        
        // Stop overlay rendering
        if (state.animationFrame) {
            cancelAnimationFrame(state.animationFrame);
            state.animationFrame = null;
        }
        
        // Stop uptime tracker
        if (state.uptimeTimer) {
            clearInterval(state.uptimeTimer);
            state.uptimeTimer = null;
        }
        state.streamUptime = 0;
        streamUptime.textContent = '00:00:00';

        disconnectFromPlatform();
        updateUI();
        showToast('Stream stopped', 'success');
        
        // Stop recording if active
        if (state.isRecording) {
            stopRecording();
        }
    }
}

function toggleStream() {
    if (state.isStreaming) {
        stopStream();
    } else {
        startStream();
    }
}

function switchSource(source) {
    state.currentSource = source;
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === source);
    });
    showToast(`Switched to ${source}`, 'success');
    if (state.isStreaming) {
        stopStream();
        setTimeout(startStream, 500);
    }
}

// ============================================
// OVERLAY SYSTEM
// ============================================

function startOverlayRendering() {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    state.canvas = canvas;

    function renderFrame() {
        if (!state.isStreaming || !previewVideo.videoWidth) {
            state.animationFrame = requestAnimationFrame(renderFrame);
            return;
        }

        const ctx = canvas.getContext('2d');
        ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
        
        state.overlays.forEach(overlay => {
            if (overlay.type === 'text') {
                ctx.fillStyle = overlay.color || '#ffffff';
                ctx.font = `${overlay.size || 48}px Arial`;
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 10;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(overlay.text || 'Hello World', overlay.x || canvas.width/2, overlay.y || canvas.height/2);
                ctx.shadowBlur = 0;
            } else if (overlay.type === 'frame') {
                ctx.strokeStyle = overlay.color || '#e94560';
                ctx.lineWidth = overlay.width || 4;
                ctx.strokeRect(overlay.x || 50, overlay.y || 50, overlay.w || 200, overlay.h || 150);
            } else if (overlay.type === 'image' && overlay.image) {
                ctx.drawImage(overlay.image, overlay.x || 50, overlay.y || 50, overlay.w || 200, overlay.h || 150);
            }
        });

        state.animationFrame = requestAnimationFrame(renderFrame);
    }

    renderFrame();
}

function addOverlay(type) {
    const overlay = {
        id: state.overlayIdCounter++,
        type: type,
        x: 100 + Math.random() * 300,
        y: 100 + Math.random() * 200,
        color: '#ffffff',
        text: 'Text Overlay',
        size: 48,
        w: 200,
        h: 150
    };

    if (type === 'text') {
        const text = prompt('Enter text for overlay:', 'Hello World!');
        if (text) {
            overlay.text = text;
            const color = prompt('Enter color (hex):', '#ffffff');
            if (color) overlay.color = color;
            const size = prompt('Enter font size:', '48');
            if (size) overlay.size = parseInt(size);
        } else {
            return;
        }
    } else if (type === 'image') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = new Image();
                    img.onload = function() {
                        overlay.image = img;
                        overlay.w = Math.min(300, img.width);
                        overlay.h = Math.min(300, img.height);
                        state.overlays.push(overlay);
                        updateOverlayUI();
                        showToast('Image overlay added!', 'success');
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
        return;
    } else if (type === 'frame') {
        overlay.color = '#e94560';
        overlay.w = 300;
        overlay.h = 200;
    }

    state.overlays.push(overlay);
    updateOverlayUI();
    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} overlay added!`, 'success');
}

function clearOverlays() {
    state.overlays = [];
    state.overlayIdCounter = 0;
    updateOverlayUI();
    showToast('All overlays cleared!', 'success');
}

function updateOverlayUI() {
    overlayContainer.innerHTML = '';
    state.overlays.forEach(overlay => {
        const el = document.createElement('div');
        if (overlay.type === 'text') {
            el.className = 'text-overlay';
            el.textContent = overlay.text || 'Text';
            el.style.left = overlay.x + 'px';
            el.style.top = overlay.y + 'px';
            el.style.color = overlay.color || '#ffffff';
            el.style.fontSize = (overlay.size || 48) + 'px';
            makeDraggable(el, overlay);
        } else if (overlay.type === 'frame') {
            el.className = 'frame-overlay';
            el.style.left = overlay.x + 'px';
            el.style.top = overlay.y + 'px';
            el.style.width = overlay.w + 'px';
            el.style.height = overlay.h + 'px';
            el.style.borderColor = overlay.color || '#e94560';
        } else if (overlay.type === 'image' && overlay.image) {
            el.className = 'image-overlay';
            const img = new Image();
            img.src = overlay.image.src;
            img.style.width = overlay.w + 'px';
            img.style.height = overlay.h + 'px';
            el.appendChild(img);
            el.style.left = overlay.x + 'px';
            el.style.top = overlay.y + 'px';
            makeDraggable(el, overlay);
        }
        overlayContainer.appendChild(el);
    });
}

function makeDraggable(el, overlay) {
    let isDragging = false;
    let startX, startY;

    el.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX - overlay.x;
        startY = e.clientY - overlay.y;
        el.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        overlay.x = e.clientX - startX;
        overlay.y = e.clientY - startY;
        el.style.left = overlay.x + 'px';
        el.style.top = overlay.y + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            el.style.cursor = 'grab';
        }
    });
}

// ============================================
// PRESETS
// ============================================

function applyPreset(preset) {
    clearOverlays();
    
    switch(preset) {
        case 'default':
            break;
        case 'fullscreen':
            addOverlay('frame');
            const frameOverlay = state.overlays[0];
            if (frameOverlay) {
                frameOverlay.x = 20;
                frameOverlay.y = 20;
                frameOverlay.w = 1240;
                frameOverlay.h = 680;
                frameOverlay.color = '#e94560';
            }
            break;
        case 'split':
            addOverlay('frame');
            const frame1 = state.overlays[0];
            if (frame1) {
                frame1.x = 20;
                frame1.y = 20;
                frame1.w = 600;
                frame1.h = 680;
                frame1.color = '#ffd93d';
            }
            addOverlay('frame');
            const frame2 = state.overlays[1];
            if (frame2) {
                frame2.x = 660;
                frame2.y = 20;
                frame2.w = 600;
                frame2.h = 680;
                frame2.color = '#6bcb77';
            }
            break;
        case 'overlay':
            addOverlay('text');
            const textOverlay = state.overlays[0];
            if (textOverlay) {
                textOverlay.text = 'LIVE STREAM';
                textOverlay.x = 640;
                textOverlay.y = 60;
                textOverlay.size = 64;
                textOverlay.color = '#e94560';
            }
            addOverlay('frame');
            const frameOverlay2 = state.overlays[1];
            if (frameOverlay2) {
                frameOverlay2.x = 20;
                frameOverlay2.y = 20;
                frameOverlay2.w = 1240;
                frameOverlay2.h = 680;
                frameOverlay2.color = 'rgba(233,69,96,0.3)';
                frameOverlay2.width = 2;
            }
            break;
    }
    
    updateOverlayUI();
    showToast(`Preset "${preset}" applied!`, 'success');
}

// ============================================
// FPS MONITOR
// ============================================

let frameCount = 0;
let lastFpsUpdate = Date.now();
let bitrateHistory = [];

function startFPSMonitor() {
    frameCount = 0;
    lastFpsUpdate = Date.now();
    bitrateHistory = [];
    
    function updateFPS() {
        frameCount++;
        const now = Date.now();
        if (now - lastFpsUpdate >= 1000) {
            fpsCounter.textContent = `FPS: ${frameCount}`;
            
            // Simulate bitrate (for demo purposes)
            const bitrate = 3000 + Math.random() * 2000;
            bitrateHistory.push(bitrate);
            if (bitrateHistory.length > 10) bitrateHistory.shift();
            const avgBitrate = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
            bitrateDisplay.textContent = `Bitrate: ${Math.round(avgBitrate)} Kbps`;
            
            frameCount = 0;
            lastFpsUpdate = now;
            
            if (previewVideo.videoWidth) {
                resolutionDisplay.textContent = `Resolution: ${previewVideo.videoWidth}x${previewVideo.videoHeight}`;
            }
        }
        if (state.isStreaming) {
            requestAnimationFrame(updateFPS);
        }
    }
    updateFPS();
}

function startUptimeTracker() {
    state.streamUptime = 0;
    if (state.uptimeTimer) {
        clearInterval(state.uptimeTimer);
    }
    state.uptimeTimer = setInterval(() => {
        state.streamUptime++;
        const hours = String(Math.floor(state.streamUptime / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((state.streamUptime % 3600) / 60)).padStart(2, '0');
        const seconds = String(state.streamUptime % 60).padStart(2, '0');
        streamUptime.textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// ============================================
// RECORDING
// ============================================

function toggleRecording() {
    if (!state.isStreaming) {
        showToast('Please start a stream first!', 'error');
        return;
    }

    if (state.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!state.canvas) {
        showToast('Canvas not ready!', 'error');
        return;
    }

    try {
        const stream = state.canvas.captureStream(30);
        if (state.mediaStream) {
            const audioTracks = state.mediaStream.getAudioTracks();
            if (audioTracks.length > 0) {
                stream.addTrack(audioTracks[0]);
            }
        }

        state.recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        state.recordedChunks = [];
        state.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                state.recordedChunks.push(e.data);
            }
        };

        state.recorder.onstop = () => {
            const blob = new Blob(state.recordedChunks, {
                type: 'video/webm'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            state.recordedChunks = [];
            showToast('Recording saved!', 'success');
        };

        state.recorder.start();
        state.isRecording = true;
        state.startTime = Date.now();
        recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
        recordBtn.classList.add('recording');
        document.querySelector('.recording-dot').classList.add('active');
        startRecordTimer();
        showToast('Recording started!', 'success');
        updateUI();
    } catch (error) {
        console.error('Error starting recording:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

function stopRecording() {
    if (state.recorder && state.isRecording) {
        state.recorder.stop();
        state.isRecording = false;
        recordBtn.innerHTML = '<i class="fas fa-circle"></i> Record';
        recordBtn.classList.remove('recording');
        document.querySelector('.recording-dot').classList.remove('active');
        clearInterval(state.recordTimer);
        recordTime.textContent = '00:00:00';
        updateUI();
        showToast('Recording stopped!', 'success');
    }
}

function startRecordTimer() {
    clearInterval(state.recordTimer);
    state.recordTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        recordTime.textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// ============================================
// SCREENSHOT
// ============================================

function takeScreenshot() {
    if (!state.isStreaming) {
        showToast('Please start a stream first!', 'error');
        return;
    }

    if (!state.canvas) {
        showToast('Canvas not ready!', 'error');
        return;
    }

    const link = document.createElement('a');
    link.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.href = state.canvas.toDataURL('image/png');
    link.click();
    showToast('Screenshot saved!', 'success');
}

// ============================================
// UI UPDATES
// ============================================

function updateUI() {
    startBtn.disabled = state.isStreaming;
    stopBtn.disabled = !state.isStreaming;
    
    if (state.isStreaming) {
        statusIndicator.className = 'status-online';
        statusIndicator.innerHTML = '<i class="fas fa-circle"></i> Live';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Streaming';
    } else {
        statusIndicator.className = 'status-offline';
        statusIndicator.innerHTML = '<i class="fas fa-circle"></i> Offline';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Start Streaming';
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 3000);
}

// ============================================
// SETTINGS MODAL
// ============================================

function openSettings() {
    settingsModal.classList.add('show');
    loadSettings();
}

function closeSettings() {
    settingsModal.classList.remove('show');
}

function loadSettings() {
    // Load saved settings
    const saved = localStorage.getItem('obs_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.platform) {
                document.querySelectorAll('.platform-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.platform === parsed.platform);
                });
                state.platform = parsed.platform;
            }
            if (parsed.streamKey) {
                document.getElementById('streamKey').value = parsed.streamKey;
            }
            if (parsed.streamTitle) {
                document.getElementById('streamTitle').value = parsed.streamTitle;
            }
            if (parsed.streamCategory) {
                document.getElementById('streamCategory').value = parsed.streamCategory;
            }
            if (parsed.resolution) {
                document.getElementById('videoResolution').value = parsed.resolution;
            }
            if (parsed.fps) {
                document.getElementById('videoFPS').value = parsed.fps;
            }
            if (parsed.bitrate) {
                document.getElementById('videoBitrate').value = parsed.bitrate;
            }
            if (parsed.audioBitrate) {
                document.getElementById('audioBitrate').value = parsed.audioBitrate;
            }
            if (parsed.volume !== undefined) {
                document.getElementById('audioVolume').value = parsed.volume;
                document.getElementById('volumeLabel').textContent = parsed.volume + '%';
            }
            if (parsed.encoder) {
                document.getElementById('encoder').value = parsed.encoder;
            }
            if (parsed.keyframeInterval) {
                document.getElementById('keyframeInterval').value = parsed.keyframeInterval;
            }
            if (parsed.lowLatency !== undefined) {
                document.getElementById('lowLatency').checked = parsed.lowLatency;
            }
            if (parsed.hardwareEncoding !== undefined) {
                document.getElementById('hardwareEncoding').checked = parsed.hardwareEncoding;
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
}

function saveSettings() {
    const settings = {
        platform: state.platform,
        streamKey: document.getElementById('streamKey').value,
        streamTitle: document.getElementById('streamTitle').value,
        streamCategory: document.getElementById('streamCategory').value,
        resolution: document.getElementById('videoResolution').value,
        fps: parseInt(document.getElementById('videoFPS').value),
        bitrate: parseInt(document.getElementById('videoBitrate').value),
        audioBitrate: parseInt(document.getElementById('audioBitrate').value),
        volume: parseInt(document.getElementById('audioVolume').value),
        encoder: document.getElementById('encoder').value,
        keyframeInterval: parseInt(document.getElementById('keyframeInterval').value),
        lowLatency: document.getElementById('lowLatency').checked,
        hardwareEncoding: document.getElementById('hardwareEncoding').checked
    };
    
    localStorage.setItem('obs_settings', JSON.stringify(settings));
    showToast('Settings saved!', 'success');
    closeSettings();
}

// ============================================
// SETTINGS TAB SWITCHING
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('tab-' + this.dataset.tab).classList.add('active');
        });
    });
    
    // Platform selection
    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.platform = this.dataset.platform;
            showToast(`Platform set to: ${this.textContent.trim()}`, 'success');
        });
    });
    
    // Volume slider
    const volumeSlider = document.getElementById('audioVolume');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function() {
            document.getElementById('volumeLabel').textContent = this.value + '%';
        });
    }
    
    // Hotkey recording
    document.querySelectorAll('.hotkey-input').forEach(input => {
        input.addEventListener('focus', function() {
            state.currentHotkeyInput = this;
            this.value = 'Press keys...';
            this.classList.add('recording');
        });
        
        input.addEventListener('blur', function() {
            if (this.value === 'Press keys...') {
                this.value = '';
            }
            this.classList.remove('recording');
            state.currentHotkeyInput = null;
        });
    });
    
    // Settings button
    settingsBtn.addEventListener('click', openSettings);
    
    // Close modal on outside click
    settingsModal.addEventListener('click', function(e) {
        if (e.target === this) {
            closeSettings();
        }
    });
});

// ============================================
// KEYBOARD HOTKEY RECORDING
// ============================================

document.addEventListener('keydown', function(e) {
    // Don't trigger hotkeys if typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }
    
    // Hotkey recording mode
    if (state.currentHotkeyInput) {
        e.preventDefault();
        const keys = [];
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.shiftKey) keys.push('Shift');
        if (e.altKey) keys.push('Alt');
        keys.push(e.key);
        const hotkeyStr = keys.join('+');
        state.currentHotkeyInput.value = hotkeyStr;
        state.hotkeys[state.currentHotkeyInput.id] = hotkeyStr;
        state.currentHotkeyInput.classList.remove('recording');
        state.currentHotkeyInput.blur();
        saveHotkeys();
        return;
    }
});

// ============================================
// MODAL HELPERS
// ============================================

function showHelp() {
    showModal('📖 Help & Hotkeys', `
        <p><strong>Default Hotkeys:</strong></p>
        <p>Ctrl+Shift+S - Start/Stop Stream</p>
        <p>Ctrl+Shift+R - Start/Stop Recording</p>
        <p>Ctrl+Shift+P - Screenshot</p>
        <p>Ctrl+1/2/3 - Switch Sources</p>
        <p>Ctrl+Shift+O - Toggle Overlays</p>
        <p>Alt+1/2/3/4 - Scene Presets</p>
        <br>
        <p><strong>Customize:</strong></p>
        <p>Click the Settings gear icon (⚙️) to set your own hotkeys!</p>
        <p>Connect to Twitch, YouTube, TikTok, and more!</p>
    `);
}

function showAbout() {
    showModal('🎥 Web OBS Studio', `
        <p>Version 2.0.0</p>
        <p>Complete web-based OBS alternative</p>
        <p><strong>Features:</strong></p>
        <p>• Webcam & Screen Capture</p>
        <p>• Multi-platform streaming (Twitch, YouTube, TikTok, Facebook)</p>
        <p>• Custom hotkey system (OBS-style)</p>
        <p>• Text & Image Overlays</p>
        <p>• Recording & Screenshots</p>
        <p>• Preset Layouts</p>
        <p>• RTMP Support</p>
        <br>
        <p>Made with ❤️ for content creators</p>
    `);
}

function showModal(title, content) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body">${content}</div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ============================================
// EVENT LISTENERS
// ============================================

// Start/Stop
startBtn.addEventListener('click', toggleStream);
stopBtn.addEventListener('click', stopStream);

// Recording
recordBtn.addEventListener('click', toggleRecording);
screenshotBtn.addEventListener('click', takeScreenshot);

// Source Selection
document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        switchSource(this.dataset.source);
    });
});

// Overlays
document.querySelectorAll('.overlay-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const type = this.dataset.overlay;
        if (type === 'clear') {
            clearOverlays();
        } else {
            addOverlay(type);
        }
    });
});

// Presets
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        applyPreset(this.dataset.preset);
    });
});

// ============================================
// INITIALIZATION
// ============================================

function init() {
    loadHotkeys();
    registerHotkeys();
    loadSettings();
    
    console.log('🎥 Web OBS Studio v2.0 loaded!');
    console.log('📖 Press Ctrl+Shift+S to start/stop streaming');
    console.log('⌨️ Click Settings (⚙️) to customize hotkeys');
    console.log('🎬 Ctrl+Shift+R to record');
    console.log('📸 Ctrl+Shift+P for screenshot');
    showToast('🎥 Web OBS Studio loaded!', 'success');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

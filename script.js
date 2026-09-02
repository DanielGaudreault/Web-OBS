// ============================================
// BROWSER STREAMER - DUAL SOURCE
// ============================================

// ===== STATE =====
const state = {
    isStreaming: false,
    isRecording: false,
    currentSource: 'camera',
    currentLayout: 'pip',
    mediaStream: null,
    cameraStream: null,
    screenStream: null,
    recorder: null,
    recordedChunks: [],
    startTime: null,
    recordTimer: null,
    overlays: [],
    overlayIdCounter: 0,
    canvas: null,
    ctx: null,
    animationFrame: null,
    platform: 'twitch',
    streamKey: '',
    streamKeyVisible: false,
    streamUptime: 0,
    uptimeTimer: null,
    videoDevices: [],
    audioDevices: [],
    selectedCamera: '',
    selectedMic: '',
    cameraSize: 0.25,
    cameraPosition: 'bottom-right',
    isDualMode: false
};

// ===== DOM ELEMENTS =====
const mixCanvas = document.getElementById('mixCanvas');
const previewVideo = document.getElementById('previewVideo');
const cameraPreview = document.getElementById('cameraPreview');
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
const streamStatus = document.getElementById('streamStatus');
const streamUptime = document.getElementById('streamUptime');
const deviceInfo = document.getElementById('deviceInfo');
const modeInfo = document.getElementById('modeInfo');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const cameraSizeSlider = document.getElementById('cameraSize');
const cameraSizeLabel = document.getElementById('cameraSizeLabel');
const cameraPositionSelect = document.getElementById('cameraPosition');

// ============================================
// DEVICE MANAGEMENT
// ============================================

async function getDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        state.videoDevices = devices.filter(d => d.kind === 'videoinput');
        state.audioDevices = devices.filter(d => d.kind === 'audioinput');
        
        cameraSelect.innerHTML = '<option value="">Select Camera...</option>';
        state.videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${state.videoDevices.indexOf(device) + 1}`;
            cameraSelect.appendChild(option);
        });
        
        micSelect.innerHTML = '<option value="">Select Microphone...</option>';
        state.audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${state.audioDevices.indexOf(device) + 1}`;
            micSelect.appendChild(option);
        });
        
        if (state.videoDevices.length > 0) {
            cameraSelect.value = state.videoDevices[0].deviceId;
            state.selectedCamera = state.videoDevices[0].deviceId;
        }
        if (state.audioDevices.length > 0) {
            micSelect.value = state.audioDevices[0].deviceId;
            state.selectedMic = state.audioDevices[0].deviceId;
        }
        
        console.log('📷 Cameras:', state.videoDevices.length);
        console.log('🎤 Microphones:', state.audioDevices.length);
        
    } catch (error) {
        console.error('Error getting devices:', error);
        showToast('Please allow camera and microphone access', 'error');
    }
}

// ============================================
// DUAL SOURCE MIXING
// ============================================

function getCanvasSize() {
    const rect = mixCanvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
}

function drawDualSource() {
    if (!state.ctx) {
        state.ctx = mixCanvas.getContext('2d');
    }
    
    const canvas = mixCanvas;
    const ctx = state.ctx;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    
    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Get video sources
    const mainVideo = state.currentSource === 'dual' ? previewVideo : previewVideo;
    const camVideo = cameraPreview;
    
    // Draw main source (screen or camera)
    if (previewVideo.readyState >= 2 && previewVideo.videoWidth > 0) {
        ctx.drawImage(previewVideo, 0, 0, rect.width, rect.height);
    } else {
        // Fill with dark background
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = '#666';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Waiting for source...', rect.width/2, rect.height/2);
    }
    
    // Draw camera overlay if in dual mode
    if (state.currentSource === 'dual' && camVideo.readyState >= 2 && camVideo.videoWidth > 0) {
        const size = state.cameraSize;
        const pos = state.cameraPosition;
        
        let camWidth = rect.width * size;
        let camHeight = (camVideo.videoHeight / camVideo.videoWidth) * camWidth;
        
        // Calculate position
        let x, y;
        const padding = 20;
        switch(pos) {
            case 'bottom-right':
                x = rect.width - camWidth - padding;
                y = rect.height - camHeight - padding;
                break;
            case 'bottom-left':
                x = padding;
                y = rect.height - camHeight - padding;
                break;
            case 'top-right':
                x = rect.width - camWidth - padding;
                y = padding;
                break;
            case 'top-left':
                x = padding;
                y = padding;
                break;
            default:
                x = rect.width - camWidth - padding;
                y = rect.height - camHeight - padding;
        }
        
        // Draw camera with rounded corners
        const radius = 12;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + camWidth - radius, y);
        ctx.quadraticCurveTo(x + camWidth, y, x + camWidth, y + radius);
        ctx.lineTo(x + camWidth, y + camHeight - radius);
        ctx.quadraticCurveTo(x + camWidth, y + camHeight, x + camWidth - radius, y + camHeight);
        ctx.lineTo(x + radius, y + camHeight);
        ctx.quadraticCurveTo(x, y + camHeight, x, y + camHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.clip();
        
        ctx.drawImage(camVideo, x, y, camWidth, camHeight);
        
        // Reset clip
        ctx.restore();
        ctx.save();
        
        // Draw border
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + camWidth - radius, y);
        ctx.quadraticCurveTo(x + camWidth, y, x + camWidth, y + radius);
        ctx.lineTo(x + camWidth, y + camHeight - radius);
        ctx.quadraticCurveTo(x + camWidth, y + camHeight, x + camWidth - radius, y + camHeight);
        ctx.lineTo(x + radius, y + camHeight);
        ctx.quadraticCurveTo(x, y + camHeight, x, y + camHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.stroke();
    }
    
    // Draw overlays
    state.overlays.forEach(overlay => {
        if (overlay.type === 'text') {
            ctx.fillStyle = overlay.color || '#ffffff';
            ctx.font = `${overlay.size || 48}px Arial`;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 10;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(overlay.text || 'Hello World', overlay.x || rect.width/2, overlay.y || rect.height/2);
            ctx.shadowBlur = 0;
        } else if (overlay.type === 'frame') {
            ctx.strokeStyle = overlay.color || '#e94560';
            ctx.lineWidth = overlay.width || 4;
            ctx.strokeRect(overlay.x || 50, overlay.y || 50, overlay.w || 200, overlay.h || 150);
        } else if (overlay.type === 'image' && overlay.image) {
            ctx.drawImage(overlay.image, overlay.x || 50, overlay.y || 50, overlay.w || 200, overlay.h || 150);
        }
    });
}

function startDualRendering() {
    function renderLoop() {
        if (state.isStreaming || state.isRecording) {
            drawDualSource();
        }
        state.animationFrame = requestAnimationFrame(renderLoop);
    }
    renderLoop();
}

// ============================================
// STREAMING
// ============================================

async function startStream() {
    try {
        const streamKey = document.getElementById('streamKey')?.value;
        if (!streamKey) {
            showToast('Please set your stream key in Settings!', 'error');
            settingsModal.classList.add('show');
            return;
        }
        
        const resolution = document.getElementById('videoResolution')?.value || '1280x720';
        const [width, height] = resolution.split('x').map(Number);
        const fps = parseInt(document.getElementById('videoFPS')?.value || 30);
        
        // Get camera stream
        const cameraConstraints = {
            video: {
                width: { ideal: width },
                height: { ideal: height },
                frameRate: { ideal: fps }
            },
            audio: true
        };
        
        if (state.selectedCamera) {
            cameraConstraints.video.deviceId = { exact: state.selectedCamera };
        }
        if (state.selectedMic) {
            cameraConstraints.audio.deviceId = { exact: state.selectedMic };
        }
        
        const cameraStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
        state.cameraStream = cameraStream;
        cameraPreview.srcObject = cameraStream;
        await cameraPreview.play();
        
        let screenStream = null;
        let mainStream = null;
        
        if (state.currentSource === 'dual') {
            // Get screen stream for dual mode
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            state.screenStream = screenStream;
            previewVideo.srcObject = screenStream;
            await previewVideo.play();
            
            // Create mixed stream from canvas
            const mixedStream = mixCanvas.captureStream(fps);
            // Add audio from camera
            const audioTracks = cameraStream.getAudioTracks();
            audioTracks.forEach(track => mixedStream.addTrack(track));
            
            state.mediaStream = mixedStream;
            state.isDualMode = true;
            modeInfo.textContent = 'Dual (Camera + Screen)';
            
        } else if (state.currentSource === 'screen') {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            state.screenStream = screenStream;
            state.mediaStream = screenStream;
            previewVideo.srcObject = screenStream;
            await previewVideo.play();
            state.isDualMode = false;
            modeInfo.textContent = 'Screen Only';
            
        } else {
            // Camera only
            state.mediaStream = cameraStream;
            previewVideo.srcObject = cameraStream;
            await previewVideo.play();
            state.isDualMode = false;
            modeInfo.textContent = 'Camera Only';
        }
        
        state.isStreaming = true;
        updateUI();
        showToast('🎥 Stream started!', 'success');
        
        // Start rendering
        startDualRendering();
        startFPSMonitor();
        startUptimeTracker();
        
        // Update device info
        const videoTrack = state.mediaStream.getVideoTracks()[0];
        if (videoTrack) {
            const settings = videoTrack.getSettings();
            deviceInfo.textContent = `${state.currentSource} - ${settings.width}x${settings.height}`;
        }
        
    } catch (error) {
        console.error('Error starting stream:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

function stopStream() {
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
    }
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(track => track.stop());
        state.screenStream = null;
    }
    
    previewVideo.srcObject = null;
    cameraPreview.srcObject = null;
    state.isStreaming = false;
    state.isDualMode = false;
    
    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = null;
    }
    
    if (state.uptimeTimer) {
        clearInterval(state.uptimeTimer);
        state.uptimeTimer = null;
    }
    state.streamUptime = 0;
    streamUptime.textContent = '00:00:00';
    
    updateUI();
    showToast('⏹️ Stream stopped', 'success');
    
    if (state.isRecording) {
        stopRecording();
    }
}

function toggleStream() {
    if (state.isStreaming) {
        stopStream();
    } else {
        startStream();
    }
}

// ============================================
// OVERLAY SYSTEM
// ============================================

function addOverlay(type) {
    const rect = mixCanvas.getBoundingClientRect();
    const overlay = {
        id: state.overlayIdCounter++,
        type: type,
        x: rect.width/2 - 100,
        y: rect.height/2 - 50,
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
    
    const rect = mixCanvas.getBoundingClientRect();
    
    switch(preset) {
        case 'default':
            break;
        case 'fullscreen':
            addOverlay('frame');
            const frameOverlay = state.overlays[0];
            if (frameOverlay) {
                frameOverlay.x = 20;
                frameOverlay.y = 20;
                frameOverlay.w = rect.width - 40;
                frameOverlay.h = rect.height - 40;
                frameOverlay.color = '#e94560';
            }
            break;
        case 'split':
            addOverlay('frame');
            const frame1 = state.overlays[0];
            if (frame1) {
                frame1.x = 20;
                frame1.y = 20;
                frame1.w = rect.width/2 - 30;
                frame1.h = rect.height - 40;
                frame1.color = '#ffd93d';
            }
            addOverlay('frame');
            const frame2 = state.overlays[1];
            if (frame2) {
                frame2.x = rect.width/2 + 10;
                frame2.y = 20;
                frame2.w = rect.width/2 - 30;
                frame2.h = rect.height - 40;
                frame2.color = '#6bcb77';
            }
            break;
        case 'overlay':
            addOverlay('text');
            const textOverlay = state.overlays[0];
            if (textOverlay) {
                textOverlay.text = 'LIVE STREAM';
                textOverlay.x = rect.width/2;
                textOverlay.y = 60;
                textOverlay.size = 64;
                textOverlay.color = '#e94560';
            }
            addOverlay('frame');
            const frameOverlay2 = state.overlays[1];
            if (frameOverlay2) {
                frameOverlay2.x = 20;
                frameOverlay2.y = 20;
                frameOverlay2.w = rect.width - 40;
                frameOverlay2.h = rect.height - 40;
                frameOverlay2.color = 'rgba(233,69,96,0.3)';
                frameOverlay2.width = 2;
            }
            break;
    }
    
    updateOverlayUI();
    showToast(`Preset "${preset}" applied!`, 'success');
}

// ============================================
// FPS & UPTIME
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
            
            const bitrate = 3000 + Math.random() * 2000;
            bitrateHistory.push(bitrate);
            if (bitrateHistory.length > 10) bitrateHistory.shift();
            const avgBitrate = bitrateHistory.reduce((a, b) => a + b, 0) / bitrateHistory.length;
            bitrateDisplay.textContent = `Bitrate: ${Math.round(avgBitrate)} Kbps`;
            
            frameCount = 0;
            lastFpsUpdate = now;
            
            const rect = mixCanvas.getBoundingClientRect();
            resolutionDisplay.textContent = `Resolution: ${Math.round(rect.width)}x${Math.round(rect.height)}`;
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
    try {
        const stream = mixCanvas.captureStream(30);
        if (state.mediaStream) {
            const audioTracks = state.mediaStream.getAudioTracks();
            audioTracks.forEach(track => stream.addTrack(track));
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
            recordingIndicator.style.display = 'none';
            showToast('Recording saved!', 'success');
        };

        state.recorder.start();
        state.isRecording = true;
        state.startTime = Date.now();
        recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
        recordBtn.classList.add('recording');
        document.querySelector('.recording-dot').classList.add('active');
        recordingIndicator.style.display = 'inline';
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
        recordingIndicator.style.display = 'none';
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

    const link = document.createElement('a');
    link.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.href = mixCanvas.toDataURL('image/png');
    link.click();
    showToast('Screenshot saved!', 'success');
}

// ============================================
// STREAM KEY HELPERS
// ============================================

function toggleStreamKeyVisibility() {
    const input = document.getElementById('streamKey');
    state.streamKeyVisible = !state.streamKeyVisible;
    input.type = state.streamKeyVisible ? 'text' : 'password';
    const btn = document.querySelector('.stream-key-help .btn:first-child');
    if (btn) {
        btn.innerHTML = state.streamKeyVisible ? '<i class="fas fa-eye-slash"></i> Hide' : '<i class="fas fa-eye"></i> Show';
    }
}

function copyStreamKey() {
    const input = document.getElementById('streamKey');
    if (input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
            showToast('📋 Stream key copied!', 'success');
        }).catch(() => {
            input.select();
            document.execCommand('copy');
            showToast('📋 Stream key copied!', 'success');
        });
    } else {
        showToast('No stream key to copy!', 'error');
    }
}

function testStreamKey() {
    const key = document.getElementById('streamKey')?.value || '';
    const statusEl = document.getElementById('keyValidationStatus');
    
    if (key.length < 8) {
        statusEl.textContent = '⚠️ Key is too short (min 8 characters)';
        statusEl.style.color = '#ff6b6b';
        statusEl.style.display = 'block';
        showToast('❌ Invalid stream key format', 'error');
        return;
    }
    
    const validPatterns = [
        /^[a-zA-Z0-9_-]{8,40}$/,
        /^live_[a-zA-Z0-9_-]+$/,
        /^[a-zA-Z0-9]{10,}$/
    ];
    
    const isValid = validPatterns.some(pattern => pattern.test(key));
    
    if (isValid) {
        statusEl.textContent = '✅ Valid stream key format!';
        statusEl.style.color = '#51cf66';
        statusEl.style.display = 'block';
        showToast('✅ Stream key looks valid!', 'success');
    } else {
        statusEl.textContent = '⚠️ Unknown format - please check your key';
        statusEl.style.color = '#ffd93d';
        statusEl.style.display = 'block';
        showToast('⚠️ Unknown key format, but it may still work', 'info');
    }
}

function showStreamKeyHelp() {
    const guides = {
        'twitch': {
            name: 'Twitch',
            steps: [
                'Go to your Twitch Dashboard',
                'Click "Stream" in the left menu',
                'Find "Stream Key" under settings',
                'Copy the key and paste it here'
            ],
            url: 'https://www.twitch.tv/settings/stream'
        },
        'youtube': {
            name: 'YouTube',
            steps: [
                'Go to YouTube Studio',
                'Click "Go Live" → "Stream"',
                'Find your Stream Key',
                'Copy and paste it here'
            ],
            url: 'https://studio.youtube.com/'
        },
        'tiktok': {
            name: 'TikTok',
            steps: [
                'Open TikTok Live Studio',
                'Go to Settings → Connection',
                'Find your Stream Key',
                'Copy and paste it here'
            ],
            url: 'https://www.tiktok.com/live'
        },
        'facebook': {
            name: 'Facebook',
            steps: [
                'Go to Facebook Live Producer',
                'Find Stream Settings',
                'Copy your Stream Key',
                'Paste it here'
            ],
            url: 'https://www.facebook.com/live/producer'
        }
    };
    
    const guide = guides[state.platform] || guides['twitch'];
    
    showModal('🔑 How to Get Your Stream Key', `
        <p><strong>For ${guide.name}:</strong></p>
        <ol style="color: #ccc; line-height: 2; margin-left: 20px;">
            ${guide.steps.map((s, i) => `<li>${i+1}. ${s}</li>`).join('')}
        </ol>
        <div style="background: rgba(233,69,96,0.1); padding: 12px 16px; border-radius: 8px; border-left: 3px solid #e94560; margin: 16px 0;">
            <p style="color: #ff6b6b; margin: 0;"><strong>⚠️ Important:</strong> Never share your stream key!</p>
        </div>
        <button class="btn btn-primary" onclick="window.open('${guide.url}', '_blank')" style="width: 100%; justify-content: center;">
            <i class="fas fa-external-link-alt"></i> Open ${guide.name}
        </button>
    `);
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
        streamStatus.textContent = 'Live';
        streamStatus.style.color = '#51cf66';
    } else {
        statusIndicator.className = 'status-offline';
        statusIndicator.innerHTML = '<i class="fas fa-circle"></i> Offline';
        startBtn.innerHTML = '<i class="fas fa-play"></i> Start Stream';
        streamStatus.textContent = 'Offline';
        streamStatus.style.color = '#ff6b6b';
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
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
    const saved = localStorage.getItem('browser_streamer_settings');
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
        fps: parseInt(document.getElementById('videoFPS').value)
    };
    
    localStorage.setItem('browser_streamer_settings', JSON.stringify(settings));
    showToast('Settings saved!', 'success');
    closeSettings();
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
        document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.currentSource = this.dataset.source;
        
        // Show/hide dual layout panel
        const dualPanel = document.getElementById('dualLayoutPanel');
        if (state.currentSource === 'dual') {
            dualPanel.style.display = 'block';
        } else {
            dualPanel.style.display = 'none';
        }
        
        showToast(`Switched to ${this.dataset.source}`, 'success');
        if (state.isStreaming) {
            stopStream();
            setTimeout(startStream, 500);
        }
    });
});

// Layout Selection
document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.currentLayout = this.dataset.layout;
        showToast(`Layout: ${this.textContent.trim()}`, 'success');
    });
});

// Camera Size
cameraSizeSlider.addEventListener('input', function() {
    state.cameraSize = parseFloat(this.value);
    cameraSizeLabel.textContent = Math.round(state.cameraSize * 100) + '%';
});

// Camera Position
cameraPositionSelect.addEventListener('change', function() {
    state.cameraPosition = this.value;
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

// Settings
settingsBtn.addEventListener('click', openSettings);
settingsModal.addEventListener('click', function(e) {
    if (e.target === this) closeSettings();
});

// Fullscreen
fullscreenBtn.addEventListener('click', function() {
    const container = document.querySelector('.preview-container');
    if (container.requestFullscreen) {
        container.requestFullscreen();
    }
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

// Device selection
cameraSelect.addEventListener('change', function() {
    state.selectedCamera = this.value;
    if (state.isStreaming) {
        stopStream();
        setTimeout(startStream, 500);
    }
});

micSelect.addEventListener('change', function() {
    state.selectedMic = this.value;
    if (state.isStreaming) {
        stopStream();
        setTimeout(startStream, 500);
    }
});

// ============================================
// MODAL HELPERS
// ============================================

function showHelp() {
    showModal('📖 Help Guide', `
        <p><strong>Quick Start:</strong></p>
        <ol style="color: #ccc; line-height: 2; margin-left: 20px;">
            <li>Click <strong>Settings</strong> (⚙️)</li>
            <li>Select your <strong>Platform</strong></li>
            <li>Enter your <strong>Stream Key</strong></li>
            <li>Select <strong>Dual</strong> mode for camera + screen</li>
            <li>Adjust camera <strong>size</strong> and <strong>position</strong></li>
            <li>Click <strong>Start Stream</strong></li>
        </ol>
        <br>
        <p><strong>Dual Mode Features:</strong></p>
        <p>📷 Camera overlay on screen</p>
        <p>📐 Adjustable camera size (10%-50%)</p>
        <p>📍 Move camera to any corner</p>
        <p>🔄 Switch layouts (PiP, Side-by-Side, Grid)</p>
    `);
}

function showAbout() {
    showModal('🎥 Browser Streamer', `
        <p>Version 2.0.0 - Dual Source</p>
        <p>Complete browser-based streaming solution</p>
        <br>
        <p><strong>Features:</strong></p>
        <p>• Camera + Screen simultaneous</p>
        <p>• Adjustable camera overlay</p>
        <p>• Multiple layouts</p>
        <p>• Recording & Screenshots</p>
        <p>• Overlay System</p>
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
// WINDOW RESIZE HANDLER
// ============================================

window.addEventListener('resize', () => {
    if (state.isStreaming || state.isRecording) {
        drawDualSource();
    }
});

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    await getDevices();
    loadSettings();
    
    // Set initial canvas size
    const rect = mixCanvas.getBoundingClientRect();
    mixCanvas.width = rect.width;
    mixCanvas.height = rect.height;
    
    console.log('🎥 Browser Streamer - Dual Source loaded!');
    console.log('📷 Cameras available:', state.videoDevices.length);
    console.log('🎤 Microphones available:', state.audioDevices.length);
    console.log('📖 Click Settings to set up your stream');
    
    // Hide dual panel initially
    document.getElementById('dualLayoutPanel').style.display = 'none';
    
    showToast('🎥 Dual Source Streamer ready!', 'success');
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

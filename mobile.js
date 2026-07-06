let peer = null;
let conn = null;
let tagsList = [];
let currentIndex = 0;
let currentPhotoMode = 'ARTICLE'; // 'ARTICLE' or 'HUID'
let engineMode = 'native'; // 'native' or 'live'
let heartbeatInterval = null;
let autoSendTimeout = null;
let autoNextTimeout = null;
let currentStream = null;
let cropper = null;
let tempUncroppedB64 = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    let savedId = localStorage.getItem('last_pc_id');
    if(savedId) document.getElementById('pcIdInput').value = savedId;
    
    // Re-apply engine mode from local storage
    let savedMode = localStorage.getItem('camera_engine_mode');
    if (savedMode) engineMode = savedMode;
});

// ==========================================
// 📡 1. PEERJS & SMART DISCONNECT TRACKER
// ==========================================
function connectToPC() {
    const pcId = document.getElementById('pcIdInput').value.trim().toUpperCase();
    if(!pcId) return alert("Please enter ID!");
    localStorage.setItem('last_pc_id', pcId);
    
    document.getElementById('statusMsg').innerText = "⏳ Connecting...";
    
    peer = new Peer({
        config: {'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]}
    });

    peer.on('open', (id) => {
        conn = peer.connect(pcId);
        
        conn.on('open', () => { 
            document.getElementById('statusMsg').innerText = "✅ Connected!"; 
            
            // 🔥 SMART TRACKER: Jab user camera use kar raha ho, tab false alarm nahi dega
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (document.visibilityState === 'visible') { // Sirf tab check karega jab browser screen par ho
                    if (conn && conn.open) { 
                        conn.send({ type: 'PING' }); 
                    } else {
                        document.getElementById('disconnectOverlay').style.display = 'flex';
                    }
                }
            }, 5000);
        });

        conn.on('data', (data) => {
            // Agar PC se Ping aati hai, toh ignore karein
            if (data.type === 'PING') return;

            // Jab data (tags list) aaye
            if (data.type === 'SYNC_LIST') {
                try {
                    tagsList = data.items;
                    let countElement = document.getElementById('totalTagsCount');
                    if (countElement) countElement.innerText = tagsList.length;
                    
                    // 🚀 NAYA LOGIC: Data aate hi seedha Camera Screen kholo!
                    showScreen('cameraScreen');
                    updateUIForCurrentTag();
                    
                    // Mobile user ko turant alert do ki data aa gaya
                    alert(`✅ ${tagsList.length} Job Cards Mobile me aagye hain!\nAb aap photo le sakte hain.`);
                } catch (err) {
                    alert("⚠️ Mobile App Code Error: " + err.message); // Agar code me koi line miss hui toh error batayega
                }
            } 
            else if (data.type === 'RETAKE_PHOTO') {
                let targetIdx = tagsList.findIndex(t => t.tagId === data.tagId && t.jobId === data.jobId);
                if(targetIdx !== -1) {
                    currentIndex = targetIdx;
                    currentPhotoMode = data.photoType;
                    showScreen('cameraScreen');
                    updateUIForCurrentTag();
                    
                    if (engineMode === 'native') {
                        alert(`🔄 RETAKE COMMAND!\nJob: ${data.jobId}\nTag: ${data.tagId}\nMode: ${data.photoType}`);
                    }
                }
            }
        });

        conn.on('close', () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            document.getElementById('statusMsg').innerText = "⚠️ Disconnected!";
            document.getElementById('disconnectOverlay').style.display = 'flex'; 
        });
    });

    // Background Sleep mode detected (Silent reconnect, no Red Screen)
    peer.on('disconnected', () => {
        console.log("Background Sleep mode detected. Silent reconnecting...");
        peer.reconnect();
    });
    
    peer.on('error', (err) => {
        if (!conn || !conn.open) {
            document.getElementById('disconnectOverlay').style.display = 'flex';
        }
    });
}

// ==========================================
// 📺 2. UI NAVIGATION & ENGINE SWITCHER
// ==========================================
function showScreen(screenId) {
    document.getElementById('idScreen').style.display = 'none';
    document.getElementById('modeScreen').style.display = 'none';
    document.getElementById('cameraScreen').style.display = 'none';
    document.getElementById('cropScreen').style.display = 'none';
    document.getElementById(screenId).style.display = 'flex';
}

function setEngineMode(mode) {
    engineMode = mode;
    localStorage.setItem('camera_engine_mode', mode);
    showScreen('cameraScreen');
    updateUIForCurrentTag();
}

function toggleEngineMode() {
    engineMode = (engineMode === 'native') ? 'live' : 'native';
    localStorage.setItem('camera_engine_mode', engineMode);
    updateUIForCurrentTag();
}

function updateUIForCurrentTag() {
    if(currentIndex >= tagsList.length) {
        alert("🎉 All Tags Completed!");
        showScreen('idScreen');
        return;
    }
    
    let item = tagsList[currentIndex];
    document.getElementById('jobIdDisplay').innerText = item.jobId;
    document.getElementById('tagIdDisplay').innerText = item.tagId;
    let displayHuid = (item.huidCode && item.huidCode !== "HUID") ? item.huidCode : "HUID";
    document.getElementById('photoTypeDisplay').innerText = currentPhotoMode === 'ARTICLE' ? "📸 ARTICLE" : "🔍 " + displayHuid;
    
    let progress = Math.round(((currentIndex) / tagsList.length) * 100);
    document.getElementById('progressBar').style.width = progress + '%';

    document.getElementById('previewImage').style.display = 'none';
    document.getElementById('placeholderBox').style.display = 'flex';
    
    // Reset Action Controls to Native Camera Input button
    document.getElementById('actionControls').style.display = 'none';
    document.getElementById('nativeCameraInput').value = "";
    
    if (engineMode === 'live') {
        document.getElementById('nativeCameraInput').style.display = 'none';
        document.getElementById('videoElement').style.display = 'block';
        document.getElementById('captureControls').style.display = 'flex';
        document.getElementById('modeToggleBtn').innerText = "Switch to Native Camera";
        
        // 🔥 Target Box sirf HUID photo ke waqt dikhega (Live Camera Mode)
        let targetBox = document.getElementById('targetOverlay');
        if(targetBox) {
            targetBox.style.display = (currentPhotoMode === 'HUID') ? 'flex' : 'none';
        }
        
        startLiveCamera();
    } else {
        document.getElementById('nativeCameraInput').style.display = 'block';
        document.getElementById('videoElement').style.display = 'none';
        document.getElementById('captureControls').style.display = 'none';
        document.getElementById('modeToggleBtn').innerText = "Switch to Live Camera";
        
        let targetBox = document.getElementById('targetOverlay');
        if(targetBox) targetBox.style.display = 'none'; // Native me box hide karo
        
        stopLiveCamera();
    }
}

// ==========================================
// 📸 3. LIVE CAMERA & AUTO-CROP LOGIC
// ==========================================
async function startLiveCamera() {
    stopLiveCamera();
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        document.getElementById('videoElement').srcObject = currentStream;
        document.getElementById('placeholderBox').style.display = 'none';
    } catch (err) {
        alert("Camera access denied or error: " + err.message);
        toggleEngineMode(); 
    }
}

function stopLiveCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

function captureLiveFrame() {
    if (!currentStream) return;
    const video = document.getElementById('videoElement');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    // 🔥 Smart Auto-Crop Logic for HUID
    if (currentPhotoMode === 'HUID') {
        const size = Math.min(vw, vh) * 0.6; 
        const startX = (vw - size) / 2;
        const startY = (vh - size) / 2;
        
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);
    } else {
        canvas.width = vw; 
        canvas.height = vh;
        ctx.drawImage(video, 0, 0, vw, vh);
    }
    
    let b64 = canvas.toDataURL('image/jpeg', 0.80);
    
    // 🔥 Check Connection Before Send
    if (conn && conn.open) {
        document.getElementById('previewImage').src = b64;
        document.getElementById('previewImage').style.display = 'block';
        document.getElementById('videoElement').style.display = 'none';
        
        let targetBox = document.getElementById('targetOverlay');
        if(targetBox) targetBox.style.display = 'none'; 
        
        document.getElementById('captureControls').style.display = 'none';
        document.getElementById('actionControls').style.display = 'flex'; 
        
        document.getElementById('actionControls').innerHTML = `
            <button onclick="triggerRetake()" style="flex:1; background:#ef4444; color:white; font-size:14px; font-weight:bold; padding:12px; border:none; border-radius:8px;">🔄 Retake</button>
            <div style="flex:1; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">✅ Sending...</div>
        `;

        let item = tagsList[currentIndex];
        conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: b64 });

        if(autoNextTimeout) clearTimeout(autoNextTimeout); 
        autoNextTimeout = setTimeout(() => {
            if (document.getElementById('previewImage').style.display === 'block') {
                nextTag(); 
            }
        }, 1200); 
    } else {
        document.getElementById('disconnectOverlay').style.display = 'flex';
    }
}

// ==========================================
// ✂️ 4. NATIVE CAMERA & CROPPER
// ==========================================
function handleNativeCameraUpload(event) {
    let file = event.target.files[0];
    if(!file) return;

    let reader = new FileReader();
    reader.onload = function(e) {
        tempUncroppedB64 = e.target.result;
        
        document.getElementById('cropImage').src = tempUncroppedB64;
        showScreen('cropScreen');
        initCropper();
        
        document.getElementById('autoSendTimerText').innerText = "Sending in 3s...";
        
        // 🔥 Time badha kar 3000ms (3 seconds) kar diya gaya hai
        if (autoSendTimeout) clearTimeout(autoSendTimeout);
        autoSendTimeout = setTimeout(() => {
            autoSendAndNext();
        }, 3000); 
    };
    reader.readAsDataURL(file);
}

document.getElementById('nativeCameraInput').addEventListener('change', handleNativeCameraUpload);

function initCropper() {
    let image = document.getElementById('cropImage');
    if(cropper) { cropper.destroy(); }
    cropper = new Cropper(image, {
        viewMode: 2,
        autoCropArea: 0.8,
        responsive: true,
        background: false,
        modal: true
    });
}

// ⏩ BINA CROP KIYE AUTO-SEND
window.autoSendAndNext = function() {
    if (!tempUncroppedB64) return;
    
    // 🔥 Check Connection Before Send
    if (conn && conn.open) {
        document.getElementById('actionControls').innerHTML = `<div style="width:100%; text-align:center; color:white; padding:10px; font-weight:bold;">✅ Sending automatically...</div>`;
        
        let item = tagsList[currentIndex];
        conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: tempUncroppedB64 });
        
        document.getElementById('nativeCameraInput').value = "";
        setTimeout(() => { showScreen('cameraScreen'); nextTag(); }, 500); 
    } else {
        document.getElementById('disconnectOverlay').style.display = 'flex';
    }
};

// ✅ CROP & SEND
window.applyCropAndSend = function() {
    if(autoSendTimeout) clearTimeout(autoSendTimeout);
    if(!cropper) return;
    
    // 🔥 Check Connection Before Send
    if (conn && conn.open) {
        document.getElementById('cropScreen').style.display = 'none';
        document.getElementById('actionControls').innerHTML = `<div style="width:100%; text-align:center; color:white; padding:10px; font-weight:bold;">✅ Sending cropped photo...</div>`;
        
        let canvas = cropper.getCroppedCanvas({
            maxWidth: 1024, maxHeight: 1024, imageSmoothingEnabled: true, imageSmoothingQuality: 'high'
        });
        let b64 = canvas.toDataURL('image/jpeg', 0.80); 
        
        let item = tagsList[currentIndex];
        conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: b64 });
        
        cropper.destroy();
        cropper = null;
        document.getElementById('nativeCameraInput').value = "";
        
        setTimeout(() => { showScreen('cameraScreen'); nextTag(); }, 500); 
    } else {
        document.getElementById('disconnectOverlay').style.display = 'flex';
    }
};

// ==========================================
// 🔄 5. LOGIC FLOW (NEXT / RETAKE)
// ==========================================
function nextTag() {
    if(autoNextTimeout) clearTimeout(autoNextTimeout);
    
    if(currentPhotoMode === 'ARTICLE') {
        currentPhotoMode = 'HUID';
    } else {
        currentPhotoMode = 'ARTICLE';
        currentIndex++;
    }
    updateUIForCurrentTag();
}

window.triggerRetake = function() {
    if(autoNextTimeout) clearTimeout(autoNextTimeout);
    updateUIForCurrentTag(); // Yeh apne aap box aur UI wapas le aayega
};
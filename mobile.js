let peer = null;
let conn = null;
let tagsList = [];
let currentIndex = 0;
let currentPhotoMode = 'ARTICLE'; 
let engineMode = 'native'; 
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
    
    let savedMode = localStorage.getItem('camera_engine_mode');
    if (savedMode) engineMode = savedMode;
    window.setCameraMode(engineMode); 
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
        config: {'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]}
    });

    peer.on('open', (id) => {
        conn = peer.connect(pcId);
        
        conn.on('open', () => { 
            document.getElementById('statusMsg').innerText = "✅ Connected!"; 
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (document.visibilityState === 'visible') { 
                    if (conn && conn.open) { conn.send({ type: 'PING' }); } 
                    else { document.getElementById('disconnectOverlay').style.display = 'flex'; }
                }
            }, 5000);
        });

        conn.on('data', (data) => {
            if (data.type === 'PING') return;

            if (data.type === 'SYNC_LIST') {
                try {
                    tagsList = data.items;
                    let countElement = document.getElementById('totalTagsCount');
                    if (countElement) countElement.innerText = tagsList.length;
                    
                    populateTagSelector(); 
                    
                    // 🔥 FIX: Seedha Camera ki jagah wapas Main Menu (Mode Screen) par bheja
                    showScreen('modeScreen');
                    
                    alert(`✅ ${tagsList.length} Job Cards Mobile me aagye hain!\nAb aap apna mode select karke photo le sakte hain.`);
                } catch (err) { alert("⚠️ Mobile App Code Error: " + err.message); }
            } 
            else if (data.type === 'RETAKE_PHOTO') {
                let targetIdx = tagsList.findIndex(t => t.tagId === data.tagId && t.jobId === data.jobId);
                if(targetIdx !== -1) {
                    currentIndex = targetIdx;
                    currentPhotoMode = data.photoType;
                    showScreen('cameraScreen');
                    updateUIForCurrentTag();
                    alert(`🔄 RETAKE COMMAND!\nJob: ${data.jobId}\nTag: ${data.tagId}\nMode: ${data.photoType}`);
                }
            }
        });

        conn.on('close', () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            document.getElementById('statusMsg').innerText = "⚠️ Disconnected!";
            document.getElementById('disconnectOverlay').style.display = 'flex'; 
        });
    });

    peer.on('disconnected', () => { peer.reconnect(); });
    peer.on('error', (err) => {
        if (!conn || !conn.open) document.getElementById('disconnectOverlay').style.display = 'flex';
    });
}

// ==========================================
// 📺 2. UI NAVIGATION & MAIN MENU
// ==========================================
function showScreen(screenId) {
    if(document.getElementById('connectScreen')) document.getElementById('connectScreen').style.display = 'none';
    if(document.getElementById('modeScreen')) document.getElementById('modeScreen').style.display = 'none';
    if(document.getElementById('cameraScreen')) document.getElementById('cameraScreen').style.display = 'none';
    if(document.getElementById('cropScreen')) document.getElementById('cropScreen').style.display = 'none';
    
    if(document.getElementById(screenId)) document.getElementById(screenId).style.display = 'block';
}

// 🔥 FIX: Main Menu ke Buttons aur Logic
window.setCameraMode = function(mode) {
    engineMode = mode;
    localStorage.setItem('camera_engine_mode', mode);
    
    if(document.getElementById('btnNative')) {
        document.getElementById('btnNative').classList.toggle('active', mode === 'native');
        document.getElementById('btnLive').classList.toggle('active', mode === 'live');
    }
};

window.startWorkflow = function(mode) {
    currentPhotoMode = mode; // 'ARTICLE' ya 'HUID'
    currentIndex = 0; // Hamesha 1st Tag se shuru karega
    showScreen('cameraScreen');
    updateUIForCurrentTag();
};

window.goBackToMode = function() {
    stopLiveCamera();
    showScreen('modeScreen');
};

window.disconnect = function() {
    if(conn) conn.close();
    if(peer) peer.destroy();
    location.reload();
};

function updateUIForCurrentTag() {
    if(currentIndex >= tagsList.length) {
        alert(`🎉 All ${currentPhotoMode} Photos Completed!`);
        window.goBackToMode();
        return;
    }
    
    let item = tagsList[currentIndex];
    
    let selector = document.getElementById('tagSelector');
    if (selector) selector.value = currentIndex;
    
    if(document.getElementById('currentJob')) document.getElementById('currentJob').innerText = item.jobId;
    if(document.getElementById('currentTag')) document.getElementById('currentTag').innerText = item.tagId;
    
    let displayHuid = (item.huidCode && item.huidCode !== "HUID") ? item.huidCode : "HUID";
    if(document.getElementById('modeDisplay')) {
        document.getElementById('modeDisplay').innerText = currentPhotoMode === 'ARTICLE' ? "📸 ARTICLE" : displayHuid;
    }
    
    if(document.getElementById('progressDisplay')) {
        document.getElementById('progressDisplay').innerText = `${currentIndex + 1} / ${tagsList.length}`;
    }

    if(document.getElementById('previewImage')) document.getElementById('previewImage').style.display = 'none';
    if(document.getElementById('placeholderBox')) document.getElementById('placeholderBox').style.display = 'flex';
    if(document.getElementById('actionControls')) document.getElementById('actionControls').style.display = 'none';
    if(document.getElementById('nativeCameraInput')) document.getElementById('nativeCameraInput').value = "";
    
    if (engineMode === 'live') {
        if(document.getElementById('nativeCameraInput')) document.getElementById('nativeCameraInput').style.display = 'none';
        if(document.getElementById('videoElement')) document.getElementById('videoElement').style.display = 'block';
        if(document.getElementById('captureControls')) document.getElementById('captureControls').style.display = 'block'; 
        
        if(document.getElementById('btnTriggerNative')) document.getElementById('btnTriggerNative').style.display = 'none';
        if(document.getElementById('btnTriggerLive')) document.getElementById('btnTriggerLive').style.display = 'block';
        
        let targetBox = document.getElementById('targetOverlay');
        // 🔥 NAYA FIX: Live Camera me HUID wala Green box hamesha hide rahega
        if(targetBox) targetBox.style.display = 'none'; 
        
        startLiveCamera();
    } else {
        if(document.getElementById('nativeCameraInput')) document.getElementById('nativeCameraInput').style.display = 'block';
        if(document.getElementById('videoElement')) document.getElementById('videoElement').style.display = 'none';
        
        if(document.getElementById('btnTriggerNative')) document.getElementById('btnTriggerNative').style.display = 'block';
        if(document.getElementById('btnTriggerLive')) document.getElementById('btnTriggerLive').style.display = 'none';
        
        let targetBox = document.getElementById('targetOverlay');
        if(targetBox) targetBox.style.display = 'none'; 
        
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
        let videoElement = document.getElementById('videoElement');
        if(videoElement) videoElement.srcObject = currentStream;
        if(document.getElementById('placeholderBox')) document.getElementById('placeholderBox').style.display = 'none';
    } catch (err) {
        alert("Camera access denied or error: " + err.message);
        window.setCameraMode('native'); 
    }
}

function stopLiveCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

window.captureLiveFrame = function() {
    if (!currentStream) return;
    const video = document.getElementById('videoElement');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    // 🔥 NAYA FIX: Live camera me chahe Article ho ya HUID, poori (Full) photo hi click hogi
    canvas.width = vw; 
    canvas.height = vh;
    ctx.drawImage(video, 0, 0, vw, vh);
    
    let b64 = canvas.toDataURL('image/jpeg', 0.80);
    
    if (conn && conn.open) {
        if(document.getElementById('previewImage')) {
            document.getElementById('previewImage').src = b64;
            document.getElementById('previewImage').style.display = 'block';
        }
        if(document.getElementById('videoElement')) document.getElementById('videoElement').style.display = 'none';
        
        let targetBox = document.getElementById('targetOverlay');
        if(targetBox) targetBox.style.display = 'none'; 
        
        if(document.getElementById('btnTriggerLive')) document.getElementById('btnTriggerLive').style.display = 'none';
        if(document.getElementById('actionControls')) {
            document.getElementById('actionControls').style.display = 'flex'; 
            document.getElementById('actionControls').innerHTML = `
                <button onclick="triggerRetake()" style="flex:1; background:#ef4444; color:white; font-size:14px; font-weight:bold; padding:12px; border:none; border-radius:8px;">🔄 Retake</button>
                <div style="flex:1; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">✅ Sending...</div>
            `;
        }

        let item = tagsList[currentIndex];
        conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: b64 });

        if(autoNextTimeout) clearTimeout(autoNextTimeout); 
        autoNextTimeout = setTimeout(() => {
            if (document.getElementById('previewImage') && document.getElementById('previewImage').style.display === 'block') {
                nextTag(); 
            }
        }, 1200); 
    } else {
        if(document.getElementById('disconnectOverlay')) document.getElementById('disconnectOverlay').style.display = 'flex';
    }
};

// ==========================================
// ✂️ 4. NATIVE CAMERA & CROPPER
// ==========================================
function handleNativeCameraUpload(event) {
    let file = event.target.files[0];
    if(!file) return;

    let reader = new FileReader();
    reader.onload = function(e) {
        tempUncroppedB64 = e.target.result;
        
        if(document.getElementById('cropImage')) document.getElementById('cropImage').src = tempUncroppedB64;
        showScreen('cropScreen');
        initCropper();
        
        if (autoSendTimeout) clearTimeout(autoSendTimeout);
        autoSendTimeout = setTimeout(() => { autoSendAndNext(); }, 3000); 
    };
    reader.readAsDataURL(file);
}

let nativeInput = document.getElementById('nativeCameraInput');
if(nativeInput) nativeInput.addEventListener('change', handleNativeCameraUpload);

function initCropper() {
    let image = document.getElementById('cropImage');
    if(cropper) { cropper.destroy(); }
    cropper = new Cropper(image, { viewMode: 2, autoCropArea: 0.8, responsive: true, background: false, modal: true });
}

window.autoSendAndNext = function() {
    if (!tempUncroppedB64) return;
    if (conn && conn.open) {
        if(document.getElementById('actionControls')) {
            document.getElementById('actionControls').innerHTML = `<div style="width:100%; text-align:center; color:white; padding:10px; font-weight:bold;">✅ Sending automatically...</div>`;
        }
        let item = tagsList[currentIndex];
        conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: tempUncroppedB64 });
        
        if(document.getElementById('nativeCameraInput')) document.getElementById('nativeCameraInput').value = "";
        setTimeout(() => { showScreen('cameraScreen'); nextTag(); }, 500); 
    } else {
        if(document.getElementById('disconnectOverlay')) document.getElementById('disconnectOverlay').style.display = 'flex';
    }
};

window.applyCropAndSend = function() {
    if(autoSendTimeout) clearTimeout(autoSendTimeout);
    if(!cropper) return;
    
    if (conn && conn.open) {
        if(document.getElementById('cropScreen')) document.getElementById('cropScreen').style.display = 'none';
        if(document.getElementById('actionControls')) {
            document.getElementById('actionControls').innerHTML = `<div style="width:100%; text-align:center; color:white; padding:10px; font-weight:bold;">✅ Sending cropped photo...</div>`;
        }
        
        let canvas = cropper.getCroppedCanvas({ maxWidth: 1024, maxHeight: 1024, imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
        let b64 = canvas.toDataURL('image/jpeg', 0.80); 
        
        let item = tagsList[currentIndex];
        conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: b64 });
        
        cropper.destroy(); cropper = null;
        if(document.getElementById('nativeCameraInput')) document.getElementById('nativeCameraInput').value = "";
        
        setTimeout(() => { showScreen('cameraScreen'); nextTag(); }, 500); 
    } else {
        if(document.getElementById('disconnectOverlay')) document.getElementById('disconnectOverlay').style.display = 'flex';
    }
};

window.cancelCrop = function() {
    if(autoSendTimeout) clearTimeout(autoSendTimeout);
    if(cropper) { cropper.destroy(); cropper = null; }
    if(document.getElementById('nativeCameraInput')) document.getElementById('nativeCameraInput').value = "";
    showScreen('cameraScreen');
};

// ==========================================
// 🔄 5. LOGIC FLOW (BATCH NEXT / RETAKE)
// ==========================================
function nextTag() {
    if(autoNextTimeout) clearTimeout(autoNextTimeout);
    
    // 🔥 FIX: Ab mode alternate nahi hoga, bas aage badhega (Batch Mode)
    currentIndex++;
    if(currentIndex >= tagsList.length) {
        alert(`🎉 All ${currentPhotoMode} Photos Completed!`);
        window.goBackToMode();
    } else {
        updateUIForCurrentTag();
    }
}

window.triggerRetake = function() {
    if(autoNextTimeout) clearTimeout(autoNextTimeout);
    updateUIForCurrentTag(); 
};

// ==========================================
// 🗂️ 6. TAG SELECTOR LIST (Dropdown)
// ==========================================
function populateTagSelector() {
    let selector = document.getElementById('tagSelector');
    if (!selector) return;
    selector.innerHTML = ""; 
    
    tagsList.forEach((item, index) => {
        let opt = document.createElement('option');
        opt.value = index;
        let displayHuid = (item.huidCode && item.huidCode !== "HUID") ? item.huidCode : "HUID";
        opt.innerText = `${index + 1}. Job: ${item.jobId} | Tag: ${item.tagId} (${displayHuid})`;
        selector.appendChild(opt);
    });
}

window.jumpToTag = function(index) {
    if(autoNextTimeout) clearTimeout(autoNextTimeout);
    currentIndex = parseInt(index);
    updateUIForCurrentTag();
};
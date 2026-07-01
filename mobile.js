let peer = null; let conn = null; 
    let heartbeatInterval = null; // 🔥 Connection tootne se bachane ke liye (PING)
    
    let tagsList = []; let currentIndex = 0;
    let currentPhotoMode = 'ARTICLE'; 
    let engineMode = 'native'; 

    let currentStream = null;
    let videoDevices = [];
    let currentDeviceIndex = 0;

    // 🔥 CROP & AUTO-SEND VARIABLES
    let cropper = null;
    let autoSendTimeout = null;
    let autoNextTimeout = null; 
    let tempUncroppedB64 = "";

    window.onload = function() {
        let savedId = localStorage.getItem('last_pc_id');
        if(savedId) document.getElementById('pcIdInput').value = savedId;
    }

    window.addEventListener('beforeunload', function (e) {
        if (conn && conn.open) { e.preventDefault(); e.returnValue = ''; }
    });

    function setCameraMode(mode) {
        engineMode = mode;
        document.getElementById('btnNative').classList.remove('active');
        document.getElementById('btnLive').classList.remove('active');
        
        if (mode === 'native') {
            document.getElementById('btnNative').classList.add('active');
        } else {
            document.getElementById('btnLive').classList.add('active');
            loadCameraDevices(); 
        }
    }

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
                
                // 🔥 NAYA CODE: Heartbeat ke sath Silent Drop Tracker
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(() => {
                    if (conn && conn.open) { 
                        conn.send({ type: 'PING' }); 
                    } else {
                        // Agar connection chup chap toot gaya (Silent Drop)
                        document.getElementById('disconnectOverlay').style.display = 'flex';
                    }
                }, 5000);
            });

            conn.on('data', (data) => {
                if (data.type === 'SYNC_LIST') {
                    tagsList = data.items;
                    document.getElementById('totalTagsCount').innerText = tagsList.length;
                    showScreen('modeScreen');
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

            // 🔥 NAYA CODE: PC ne connection close kar diya
            conn.on('close', () => {
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                document.getElementById('statusMsg').innerText = "⚠️ Disconnected!";
                document.getElementById('disconnectOverlay').style.display = 'flex'; 
            });
        });

        // 🔥 NAYA CODE: Mobile ka network/WiFi toot gaya
        peer.on('disconnected', () => {
            document.getElementById('disconnectOverlay').style.display = 'flex';
        });
        
        peer.on('error', (err) => {
            document.getElementById('disconnectOverlay').style.display = 'flex';
        });
    }

    function startWorkflow(mode) {
        if(tagsList.length === 0) return alert("List khali hai!");
        currentPhotoMode = mode;
        currentIndex = 0; 
        
        let selector = document.getElementById('tagSelector');
        selector.innerHTML = '';
        tagsList.forEach((item, idx) => {
            let opt = document.createElement('option');
            opt.value = idx;
            opt.innerText = `${idx + 1}. ${item.tagId} (${item.jobId})`;
            selector.appendChild(opt);
        });

        showScreen('cameraScreen');
        updateUIForCurrentTag();
    }

    window.jumpToTag = function(idx) {
        currentIndex = parseInt(idx);
        updateUIForCurrentTag();
    }

    function updateUIForCurrentTag() {
        if (currentIndex >= tagsList.length) {
            alert(`🎉 ${currentPhotoMode} mode complete!`);
            goBackToMode(); return;
        }

        let item = tagsList[currentIndex];
        document.getElementById('modeDisplay').innerText = currentPhotoMode;
        document.getElementById('progressDisplay').innerText = `${currentIndex + 1} / ${tagsList.length}`;
        document.getElementById('currentTag').innerText = item.tagId;
        document.getElementById('currentJob').innerText = item.jobId;
        
        document.getElementById('tagSelector').value = currentIndex;
        resetUI();

        if (engineMode === 'live') {
            startLiveStream();
        } else {
            document.getElementById('btnTriggerNative').style.display = 'block';
            document.getElementById('placeholderBox').style.display = 'flex';
        }
    }

    function resetUI() {
        document.getElementById('previewImage').style.display = 'none';
        document.getElementById('videoElement').style.display = 'none';
        document.getElementById('placeholderBox').style.display = 'none';
        
        document.getElementById('captureControls').style.display = 'block';
        document.getElementById('actionControls').style.display = 'none';
        
        document.getElementById('btnTriggerNative').style.display = 'none';
        document.getElementById('btnTriggerLive').style.display = 'none';
        document.getElementById('btnSwitchLens').style.display = 'none';
        document.getElementById('nativeCameraInput').value = "";
    }

    // =====================================
    // 🚀 NATIVE CAMERA: AUTO-SEND & CROP ENGINE
    // =====================================
    document.getElementById('nativeCameraInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        let currentBtn = document.getElementById('btnTriggerNative');
        let originalText = currentBtn.innerHTML;
        currentBtn.innerHTML = "⏳ Processing...";
        currentBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > 1024) { h *= 1024/w; w = 1024; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                
                tempUncroppedB64 = canvas.toDataURL('image/jpeg', 0.80); 
                
                // Preview dikhao
                document.getElementById('previewImage').src = tempUncroppedB64;
                document.getElementById('previewImage').style.display = 'block';
                document.getElementById('videoElement').style.display = 'none';
                document.getElementById('placeholderBox').style.display = 'none';
                
                document.getElementById('captureControls').style.display = 'none';
                document.getElementById('actionControls').style.display = 'flex';
                
                // Retake & Crop Buttons (1.2 sec ke window ke liye)
                document.getElementById('actionControls').innerHTML = `
                    <button onclick="triggerRetake()" style="flex:1; background:#ef4444; color:white; font-size:14px; font-weight:bold; padding:12px; border:none; border-radius:8px;">🔄 Retake</button>
                    <button onclick="openCropScreen()" style="flex:1; background:#f59e0b; color:black; font-size:14px; font-weight:bold; padding:12px; border:none; border-radius:8px;">✂️ Crop Photo</button>
                `;

                // 🔥 1.2 Second Auto-Send Timer
                if (autoSendTimeout) clearTimeout(autoSendTimeout);
                autoSendTimeout = setTimeout(() => {
                    autoSendAndNext();
                }, 1600); 

                setTimeout(() => {
                    currentBtn.innerHTML = originalText;
                    currentBtn.disabled = false;
                }, 500);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // ⏩ BINA CROP KIYE AUTO-SEND
    window.autoSendAndNext = function() {
        if (!tempUncroppedB64) return;
        
        document.getElementById('actionControls').innerHTML = `<div style="width:100%; text-align:center; color:white; padding:10px; font-weight:bold;">✅ Sending automatically...</div>`;
        
        if (conn && conn.open) {
            let item = tagsList[currentIndex];
            conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: tempUncroppedB64 });
        }
        
        document.getElementById('nativeCameraInput').value = "";
        setTimeout(() => { nextTag(); }, 500); // Send hone ke aadhe second baad Next Tag
    };

    // ✂️ TIMER ROKO AUR CROP SCREEN KHOLO
    window.openCropScreen = function() {
        if (autoSendTimeout) clearTimeout(autoSendTimeout); // Auto Send Rok Do!
        
        document.getElementById('cropImage').src = tempUncroppedB64;
        document.getElementById('cropScreen').style.display = 'flex';
        
        if(cropper) cropper.destroy();
        cropper = new Cropper(document.getElementById('cropImage'), {
            viewMode: 1,
            autoCropArea: 0.9,
            movable: true,
            zoomable: true,
            rotatable: false,
            scalable: false
        });
    };

    // ❌ CROP CANCEL (Wapas Camera)
    window.cancelCrop = function() {
        document.getElementById('cropScreen').style.display = 'none';
        if(cropper) cropper.destroy();
        document.getElementById('nativeCameraInput').value = ""; 
        triggerRetake();
    };

    // ✅ CROP & SEND
    window.applyCropAndSend = function() {
        if(!cropper) return;
        
        document.getElementById('cropScreen').style.display = 'none';
        document.getElementById('actionControls').innerHTML = `<div style="width:100%; text-align:center; color:white; padding:10px; font-weight:bold;">✅ Sending cropped photo...</div>`;
        
        let canvas = cropper.getCroppedCanvas({
            maxWidth: 1024,
            maxHeight: 1024,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });
        let b64 = canvas.toDataURL('image/jpeg', 0.80); 
        
        if (conn && conn.open) {
            let item = tagsList[currentIndex];
            conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: b64 });
        }
        
        cropper.destroy();
        cropper = null;
        document.getElementById('nativeCameraInput').value = "";
        
        setTimeout(() => { nextTag(); }, 500); // Send hone ke baad Next
    };

    // =====================================
    // LIVE CAMERA ENGINE LOGIC (Fallbacks)
    // =====================================
    async function loadCameraDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            videoDevices = devices.filter(d => d.kind === 'videoinput');
        } catch (err) {}
    }

    async function startLiveStream() {
        if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); }
        
        let isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        let constraints = isMobile ? { video: { facingMode: "environment" } } : { video: true };
        if (videoDevices.length > 0) { constraints = { video: { deviceId: { exact: videoDevices[currentDeviceIndex].deviceId } } }; }

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            let video = document.getElementById('videoElement');
            video.srcObject = currentStream;
            video.style.display = 'block';
            
            document.getElementById('btnTriggerLive').style.display = 'block';
            if(videoDevices.length > 1) document.getElementById('btnSwitchLens').style.display = 'inline-block';
        } catch (error) {
            alert("Camera not found or blocked. Make sure URL is secure (https/localhost).");
        }
    }

    function switchLiveCamera() {
        if (videoDevices.length > 1) {
            currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
            startLiveStream();
        }
    }

    function captureLiveFrame() {
        if (!currentStream) return;
        const video = document.getElementById('videoElement');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Live camera me bina crop ke direct bhejne ka logic (Fast mode)
        let b64 = canvas.toDataURL('image/jpeg', 0.70);
        
        document.getElementById('previewImage').src = b64;
        document.getElementById('previewImage').style.display = 'block';
        document.getElementById('videoElement').style.display = 'none';
        document.getElementById('placeholderBox').style.display = 'none';
        
        document.getElementById('captureControls').style.display = 'none';
        document.getElementById('actionControls').style.display = 'flex'; 
        
        document.getElementById('actionControls').innerHTML = `
            <button onclick="triggerRetake()" style="flex:1; background:#ef4444; color:white; font-size:14px; font-weight:bold; padding:12px; border:none; border-radius:8px;">🔄 Retake</button>
            <div style="flex:1; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">✅ Sending...</div>
        `;

        if (conn && conn.open) {
            let item = tagsList[currentIndex];
            conn.send({ type: 'PHOTO_UPLOAD', reqId: item.reqId, jobId: item.jobId, tagId: item.tagId, photoType: currentPhotoMode, image: b64 });
        }

        if(autoNextTimeout) clearTimeout(autoNextTimeout); 
        autoNextTimeout = setTimeout(() => {
            if (document.getElementById('previewImage').style.display === 'block') {
                nextTag(); 
            }
        }, 1200); 
    }

    function triggerRetake() {
        // 🔥 Agar dukaandaar ne Retake daba diya toh Auto-Send aur Auto-Next dono rok do
        if(autoNextTimeout) clearTimeout(autoNextTimeout); 
        if(autoSendTimeout) clearTimeout(autoSendTimeout); 
        
        resetUI();
        if(engineMode === 'native') document.getElementById('nativeCameraInput').click();
        else startLiveStream();
    }
    
    function nextTag() { currentIndex++; updateUIForCurrentTag(); }
    
    function showScreen(id) {
        document.querySelectorAll('#connectScreen, #modeScreen, #cameraScreen').forEach(el => el.style.display = 'none');
        document.getElementById(id).style.display = 'block';
        if(id !== 'cameraScreen' && currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
    }
    
    function goBackToMode() { showScreen('modeScreen'); }
    
    function disconnect() { 
        if(heartbeatInterval) clearInterval(heartbeatInterval); 
        if(peer) peer.destroy(); 
        location.reload(); 
    }

    // Service Worker for PWA Offline Capability
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(err => console.log(err));
    }
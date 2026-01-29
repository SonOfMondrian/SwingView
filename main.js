const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');

// Remote Elements
const remoteVideo = document.getElementById('remote-video'); // Source
const remoteCanvas = document.getElementById('remote-canvas'); // Display
const remoteCtx = remoteCanvas.getContext('2d');

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBadge = document.getElementById('status-badge');
const bufferStat = document.getElementById('buffer-stat');

let stream = null;
let isRunning = false;
let animationFrameId = null;
let frameBuffer = [];       // Local buffer
let remoteFrameBuffer = []; // Remote buffer
let DELAY_MS = 2000; // Default 2 seconds
const delayInput = document.getElementById('delay-input');
const mirrorBtn = document.getElementById('btn-mirror');

// Mirror Toggle Event
mirrorBtn.addEventListener('click', () => {
    canvasElement.classList.toggle('mirrored');
    remoteCanvas.classList.toggle('mirrored');

    // Optional: Visual feedback on button
    if (canvasElement.classList.contains('mirrored')) {
        mirrorBtn.style.background = "var(--primary-color)";
        mirrorBtn.style.color = "#000";
    } else {
        mirrorBtn.style.background = "";
        mirrorBtn.style.color = "";
    }
});

// Delay Change Event
delayInput.addEventListener('change', (e) => {
    let val = parseFloat(e.target.value);
    // Enforce constraints
    if (val < 1) val = 1;
    if (val > 10) val = 10;

    e.target.value = val; // Update UI if corrected
    DELAY_MS = val * 1000;

    // Update badge text
    if (isRunning) {
        statusBadge.textContent = `작동 중 (${val}초 지연)`;
    }

    // 지연 시간 변경 시 버퍼 초기화 (이전 지연 데이터 삭제)
    frameBuffer.forEach(item => { if (item.bitmap) item.bitmap.close(); });
    frameBuffer = [];
    remoteFrameBuffer.forEach(item => { if (item.bitmap) item.bitmap.close(); });
    remoteFrameBuffer = [];
});

// Start Camera
async function startCamera() {
    console.log("startCamera called");
    // 보안 컨텍스트 확인 (HTTP 접속 시 navigator.mediaDevices가 없음)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("보안 오류: 현재 보안되지 않은 연결(HTTP)로 접속 중입니다.\n\n" +
            "해결 방법:\n" +
            "1. HTTPS 주소로 접속하세요.\n" +
            "2. 안드로이드는 Chrome 설정(chrome://flags)에서 현재 주소를 'Insecure origins treated as secure'에 등록하세요.");
        return;
    }

    try {
        console.log("Requesting camera access...");
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: { ideal: "user" }
            },
            audio: false
        });
        console.log("Camera access granted");
        videoElement.srcObject = stream;

        videoElement.onloadedmetadata = async () => {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;

            try {
                await videoElement.play();
                isRunning = true;
                isRunning = true;
                const currentDelay = delayInput.value;
                statusBadge.textContent = `작동 중 (${currentDelay}초 지연)`;
                statusBadge.style.color = "var(--primary-color)";
                processFrame();

                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
            } catch (err) {
                console.error("Video play error:", err);
            }
        };
    } catch (error) {
        console.error("Camera access error:", error);
        alert("카메라 에러: " + error.name);
    }
}

// Stop Camera
function stopCamera() {
    isRunning = false;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    // Clear buffer
    frameBuffer.forEach(item => {
        if (item.bitmap) item.bitmap.close();
    });
    frameBuffer = [];

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    statusBadge.textContent = "중지됨";
    statusBadge.style.color = "var(--text-main)";

    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    bufferStat.innerText = "0f";
}

// Process Frames Loop (Dual Stream)
async function processFrame() {
    if (!isRunning) return;

    const now = performance.now();

    // 1. Capture Frames (Local)
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        try {
            const bitmap = await createImageBitmap(videoElement);
            frameBuffer.push({ bitmap: bitmap, time: now });
        } catch (e) { console.error("Local frame capture error:", e); }
    }

    // 2. Capture Frames (Remote)
    if (remoteVideo.readyState >= remoteVideo.HAVE_CURRENT_DATA) {
        // Init remote canvas size if needed
        if (remoteCanvas.width !== remoteVideo.videoWidth) {
            remoteCanvas.width = remoteVideo.videoWidth || 640;
            remoteCanvas.height = remoteVideo.videoHeight || 480;
        }
        try {
            const bitmap = await createImageBitmap(remoteVideo);
            remoteFrameBuffer.push({ bitmap: bitmap, time: now });
        } catch (e) {
            // console.error("Remote frame capture error:", e); 
            // Silent error on remote empty frame
        }
    }

    const delayedTime = now - DELAY_MS;

    // 3. Render Local Frame (Delayed)
    let localFrame = null;
    if (frameBuffer.length > 0 && frameBuffer[0].time <= delayedTime) {
        localFrame = frameBuffer.shift();
    }
    if (localFrame) {
        canvasCtx.drawImage(localFrame.bitmap, 0, 0, canvasElement.width, canvasElement.height);
        localFrame.bitmap.close();
    }

    // 4. Render Remote Frame (Delayed)
    let remoteFrame = null;
    if (remoteFrameBuffer.length > 0 && remoteFrameBuffer[0].time <= delayedTime) {
        remoteFrame = remoteFrameBuffer.shift();
    }
    if (remoteFrame) {
        remoteCtx.drawImage(remoteFrame.bitmap, 0, 0, remoteCanvas.width, remoteCanvas.height);
        remoteFrame.bitmap.close();
    }

    // Update stats (Local buffer size)
    bufferStat.innerText = `L:${frameBuffer.length}f / R:${remoteFrameBuffer.length}f`;

    animationFrameId = requestAnimationFrame(processFrame);
}

// Event Listeners
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

// --- Socket.IO & WebRTC (Remote Camera) ---
// socket and remoteVideo are already declared at the top
const socket = io(); // This line was not removed as it's the first declaration of `socket`
let peerConnection;
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

socket.emit('join', 'camera-room'); // Join the room

// Laptop waits for an offer from the Phone
let iceCandidatesBuffer = [];

socket.on('offer', async (offer) => {
    console.log("Received Offer from Phone");
    if (peerConnection) {
        peerConnection.close();
        iceCandidatesBuffer = [];
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onconnectionstatechange = () => {
        console.log("WebRTC Connection State:", peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            statusBadge.textContent = "작동 중 (듀얼 지연)";
        }
    };

    peerConnection.ontrack = (event) => {
        console.log("Remote track received:", event.streams[0]);
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.muted = true;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.play()
            .then(() => console.log("Remote video successfully playing"))
            .catch(e => console.error("Remote video play error:", e));
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Process buffered candidates
    while (iceCandidatesBuffer.length > 0) {
        const candidate = iceCandidatesBuffer.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("Error adding buffered ice candidate", e);
        }
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', answer);
});

socket.on('ice-candidate', async (candidate) => {
    if (peerConnection && peerConnection.remoteDescription) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("Error adding ice candidate", e);
        }
    } else {
        iceCandidatesBuffer.push(candidate);
    }
});

// --- Resizable Split Screen Logic ---
const gutter = document.getElementById('drag-gutter');
const leftView = document.getElementById('view-left');
const rightView = document.getElementById('view-right');
const container = document.getElementById('camera-container');

let isDragging = false;

gutter.addEventListener('mousedown', (e) => {
    isDragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault(); // Prevent text selection
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const x = e.clientX - containerRect.left; // Mouse X relative to container

    // Calculate percentages
    let leftWidthPercent = (x / containerWidth) * 100;

    // Constraints (10% - 90%)
    if (leftWidthPercent < 10) leftWidthPercent = 10;
    if (leftWidthPercent > 90) leftWidthPercent = 90;

    const rightWidthPercent = 100 - leftWidthPercent;

    // Apply Flex Basis (Subtract gutter width approximation if needed, but flex handles it well enough)
    leftView.style.flex = `0 0 ${leftWidthPercent}%`;
    rightView.style.flex = `0 0 calc(${rightWidthPercent}% - 10px)`; // Subtract gutter size

    // Canvas resizing is handled by object-fit: contain in CSS, 
    // but we need to ensure internal canvas resolution matches if we want pixel perfect (optional)
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        document.body.style.cursor = 'default';

        // Resize canvas buffers if dimensions changed significantly?
        // Not strictly necessary as we draw imageBitmap full size to canvas
    }
});

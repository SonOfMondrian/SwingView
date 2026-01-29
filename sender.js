const socket = io();
const localVideo = document.getElementById('localVideo');
const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');

let localStream;
let peerConnection;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// --- Lobby Logic ---
const lobby = document.getElementById('lobby');
const mainUI = document.getElementById('main-ui');
const roomCodeInput = document.getElementById('room-code');
const btnJoin = document.getElementById('btn-join');

// --- Security Helper ---
async function hashRoomCode(code) {
    const encoder = new TextEncoder();
    const data = encoder.encode(code + "swing_view_salt_v1"); // main.js와 동일한 솔트 사용
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

btnJoin.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim();
    if (code.length >= 2) {
        const hashedCode = await hashRoomCode(code);
        socket.emit('join', hashedCode);
        lobby.classList.add('hidden');
        mainUI.classList.remove('hidden');

        // 자동 시작 (휴대폰 카메라)
        startCamera();
    } else {
        alert("최소 2자 이상의 비밀 코드를 입력해 주세요.");
    }
});

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: { ideal: "user" }
            },
            audio: false
        });
        localVideo.srcObject = stream;
        localStream = stream;
        statusDiv.innerText = "카메라 활성화됨. 노트북 연결 중...";

        // Initiate Connection (Caller)
        createOffer();

    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('카메라 접근 실패: ' + err.name);
    }
}

async function createOffer() {
    if (peerConnection) peerConnection.close(); // Clean up previous connection
    console.log("Creating Offer...");

    peerConnection = new RTCPeerConnection(config);

    // Monitoring
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        statusDiv.innerText = "상태: " + state;
        console.log("Connection State:", state);

        if (state === 'connected') {
            statusDiv.innerText = "노트북 연결됨";
            statusDiv.classList.add('connected');
        } else if (state === 'failed' || state === 'disconnected') {
            statusDiv.innerText = "연결 실패. 3초 후 재시도...";
            statusDiv.classList.remove('connected');

            setTimeout(() => {
                createOffer();
            }, 3000);
        }
    };

    // Add tracks
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // ICE Candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    // Create Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
}

// Handle Answer from Laptop
socket.on('answer', async (answer) => {
    if (!peerConnection) return;
    console.log("Received Answer");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    statusDiv.innerText = "Connected! Streaming to Laptop.";
    statusDiv.classList.add('connected');
});

socket.on('ice-candidate', async (candidate) => {
    if (peerConnection && peerConnection.remoteDescription) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    }
});

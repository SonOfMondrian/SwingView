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

btnJoin.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim();
    if (code.length === 4) {
        socket.emit('join', code);
        lobby.classList.add('hidden');
        mainUI.classList.remove('hidden');

        // 자동 시작 (휴대폰 카메라)
        startCamera();
    } else {
        alert("4자리 숫자를 입력해 주세요.");
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
        statusDiv.innerText = "Camera Active. Connecting to Laptop...";

        // Initiate Connection (Caller)
        createOffer();

    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Camera access failed: ' + err.name);
    }
}

async function createOffer() {
    if (peerConnection) peerConnection.close(); // Clean up previous connection
    console.log("Creating Offer...");

    peerConnection = new RTCPeerConnection(config);

    // Monitoring
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        statusDiv.innerText = "State: " + state;
        console.log("Connection State:", state);

        if (state === 'failed' || state === 'disconnected') {
            statusDiv.innerText = "Connection failed. Retrying in 3s...";
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

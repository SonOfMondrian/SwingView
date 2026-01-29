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

socket.emit('join', 'camera-room');

startBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user" // Front Camera (Selfie)
            },
            audio: false
        });
        localVideo.srcObject = stream;
        localStream = stream;
        startBtn.style.display = 'none';
        statusDiv.innerText = "Camera Active. Connecting to Laptop...";

        // Initiate Connection (Caller)
        createOffer();

    } catch (err) {
        console.error('Error accessing media devices.', err);
        alert('Camera access failed: ' + err.name);
    }
});

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

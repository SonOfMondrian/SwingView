import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Constants
const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Socket.IO Connection Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.join('camera-room');

    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined ${room}`);
    });

    // Relay 'offer' from sender to receiver
    socket.on('offer', (data) => {
        // Broadcast to others in the room
        socket.to('camera-room').emit('offer', data);
    });

    // Relay 'answer' from receiver to sender
    socket.on('answer', (data) => {
        socket.to('camera-room').emit('answer', data);
    });

    // Relay 'ice-candidate'
    socket.on('ice-candidate', (data) => {
        socket.to('camera-room').emit('ice-candidate', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/sender', (req, res) => {
    res.sendFile(path.join(__dirname, 'sender.html'));
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Ensure both devices are on the same Wi-Fi.`);
});

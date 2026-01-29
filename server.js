import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

const httpServer = createServer(app);
const io = new Server(httpServer);

// Constants
const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Socket.IO Connection Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    let userRoom = null;

    socket.on('join', (room) => {
        if (userRoom) {
            socket.leave(userRoom);
        }
        userRoom = room;
        socket.join(room);
        console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    // Relay 'offer' from sender to receiver in the same room
    socket.on('offer', (data) => {
        if (userRoom) {
            socket.to(userRoom).emit('offer', data);
        }
    });

    // Relay 'answer' from receiver to sender in the same room
    socket.on('answer', (data) => {
        if (userRoom) {
            socket.to(userRoom).emit('answer', data);
        }
    });

    // Relay 'ice-candidate' in the same room
    socket.on('ice-candidate', (data) => {
        if (userRoom) {
            socket.to(userRoom).emit('ice-candidate', data);
        }
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
    console.log(`Server running at port ${PORT}`);
});

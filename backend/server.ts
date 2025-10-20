import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ['GET', 'POST'] },  // Allow all for testing
});

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.send('OK - Backend alive!'));

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  socket.emit('welcome', { message: 'Welcome to MindDuel backend!' });
  socket.on('disconnect', () => console.log('Player left'));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

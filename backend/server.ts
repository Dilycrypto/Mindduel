import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.send('OK - Backend alive!'));

// In-memory pools (fake data—later: DB)
interface Pool {
  id: string;
  stake: string;
  players: number;
  playerList: string[];  // Wallet addresses
}
const pools: { [key: string]: Pool } = {
  '0.50': { id: '0.50', stake: '$0.50', players: 5, playerList: ['0xabc...', '0xdef...'] },
  '1': { id: '1', stake: '$1', players: 12, playerList: ['0xghi...', '0xjkl...'] },
  '5': { id: '5', stake: '$5', players: 8, playerList: ['0xmno...'] },
  '10': { id: '10', stake: '$10', players: 3, playerList: [] },
};

io.on('connection', (socket: Socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinPool', (data: { poolId: string; wallet: string }) => {
    const { poolId, wallet } = data;
    if (pools[poolId]) {
      if (!pools[poolId].playerList.includes(wallet)) {
        pools[poolId].playerList.push(wallet);
        pools[poolId].players = pools[poolId].playerList.length;
        console.log(`Player ${wallet} joined ${poolId} pool. Total: ${pools[poolId].players}`);
        
        // Broadcast to all in this pool/room
        socket.join(poolId);
        io.to(poolId).emit('poolUpdate', { 
          poolId, 
          players: pools[poolId].players, 
          playerList: pools[poolId].playerList 
        });
      } else {
        socket.emit('error', { message: 'Already joined!' });
      }
    }
  });

  socket.on('leavePool', (poolId: string) => {
    // Mock leave—implement later
    socket.leave(poolId);
  });

  socket.on('disconnect', () => {
    console.log('Player left:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

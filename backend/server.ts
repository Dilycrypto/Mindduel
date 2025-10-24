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

interface Pool {
  id: string;
  stake: string;
  players: number;
  playerList: string[];
}
const pools: { [key: string]: Pool } = {
  '0.50': { id: '0.50', stake: '$0.50', players: 0, playerList: [] },
  '1': { id: '1', stake: '$1', players: 0, playerList: [] },
  '5': { id: '5', stake: '$5', players: 0, playerList: [] },
  '10': { id: '10', stake: '$10', players: 0, playerList: [] },
};

interface PlayerScore { wallet: string; score: number; }
const games: { [poolId: string]: { questions: any[]; players: PlayerScore[]; currentQ: number; } } = {};

const questionBank = [
  { q: "What is the capital of France?", options: ["Paris", "London", "Berlin", "Madrid"], correct: "Paris" },
  { q: "Who won the 2024 World Series?", options: ["Dodgers", "Yankees", "Astros", "Phillies"], correct: "Dodgers" },
  { q: "E=mc² is from which scientist?", options: ["Einstein", "Newton", "Tesla", "Curie"], correct: "Einstein" },
  { q: "Largest ocean on Earth?", options: ["Pacific", "Atlantic", "Indian", "Arctic"], correct: "Pacific" },
  { q: "What AI model dominated benchmarks in early 2025?", options: ["Grok-3", "GPT-5", "Claude 4", "Gemini 2"], correct: "Grok-3" },
  { q: "Mount Everest is in which range?", options: ["Himalayas", "Andes", "Rockies", "Alps"], correct: "Himalayas" },
  { q: "First iPhone released in?", options: ["2007", "2001", "2010", "1999"], correct: "2007" },
  { q: "Planet closest to Sun?", options: ["Mercury", "Venus", "Earth", "Mars"], correct: "Mercury" },
  { q: "Which country hosted 2024 Summer Olympics?", options: ["France", "USA", "Japan", "Brazil"], correct: "France" },
  { q: "Python programming language named after?", options: ["Monty Python", "Snake", "Programming God", "Empire"], correct: "Monty Python" },
];

io.on('connection', (socket: Socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinPool', (data: { poolId: string; wallet: string }) => {
    const { poolId, wallet } = data;
    if (pools[poolId]) {
      if (!pools[poolId].playerList.includes(wallet)) {
        pools[poolId].playerList.push(wallet);
        pools[poolId].players = pools[poolId].playerList.length;
        
        socket.join(poolId);
        io.to(poolId).emit('poolUpdate', { 
          poolId, 
          players: pools[poolId].players, 
          playerList: pools[poolId].playerList 
        });
        
        console.log(`Player ${wallet.slice(0,6)}... joined ${poolId} pool. Total: ${pools[poolId].players}`);

        if (games[poolId]) {
          socket.emit('gameState', {
            questions: games[poolId].questions,
            currentQ: games[poolId].currentQ,
            players: games[poolId].players
          });
        }

        if (pools[poolId].players >= 1 && !games[poolId]) {
          games[poolId] = { 
            questions: [...questionBank].sort(() => Math.random() - 0.5),
            players: pools[poolId].playerList.map(w => ({ wallet: w, score: 0 })),
            currentQ: 0 
          };
          io.to(poolId).emit('gameStart', { 
            poolId, 
            questions: games[poolId].questions,
            players: games[poolId].players 
          });
          console.log(`Game started in ${poolId} pool!`);
        }
      } else {
        // Allow re-join for testing—send state if game active
        socket.join(poolId);
        if (games[poolId]) {
          socket.emit('gameState', {
            questions: games[poolId].questions,
            currentQ: games[poolId].currentQ,
            players: games[poolId].players
          });
        }
        socket.emit('error', { message: 'Already joined—sending current state!' });
        console.log(`Player ${wallet.slice(0,6)}... re-joined ${poolId}—sent state.`);
      }
    }
  });

  socket.on('submitAnswer', (data: { poolId: string; wallet: string; answer: string; qIndex: number }) => {
    const { poolId, wallet, answer, qIndex } = data;
    if (games[poolId] && games[poolId].currentQ === qIndex) {
      const player = games[poolId].players.find(p => p.wallet === wallet);
      if (player && answer === games[poolId].questions[qIndex].correct) {
        player.score += 1;
      }
      io.to(poolId).emit('scoreUpdate', { 
        poolId, 
        players: games[poolId].players, 
        currentQ: qIndex 
      });
      console.log(`Answer submitted in ${poolId}: ${wallet.slice(0,6)}... scored? ${answer === games[poolId].questions[qIndex].correct}`);
    }
  });

  socket.on('nextQuestion', (data: { poolId: string }) => {
    const { poolId } = data;
    if (games[poolId]) {
      games[poolId].currentQ += 1;
      if (games[poolId].currentQ < 10) {
        io.to(poolId).emit('nextQuestion', { poolId, qIndex: games[poolId].currentQ });
      } else {
        const totalPool = pools[poolId].players * parseFloat(poolId);
        const sortedPlayers = games[poolId].players.sort((a, b) => b.score - a.score);
        const prizes = sortedPlayers.slice(0, 3).map((p, i) => ({ 
          wallet: p.wallet, 
          prize: (totalPool * (i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2) * 0.9).toFixed(2) 
        }));
        io.to(poolId).emit('gameEnd', { poolId, prizes, finalScores: sortedPlayers });
        console.log(`Game ended in ${poolId}: Winners ${prizes.map(p => p.wallet.slice(0,6)).join(', ')}`);
      }
    }
  });

  socket.on('leavePool', (poolId: string) => {
    socket.leave(poolId);
  });

  socket.on('disconnect', () => console.log('Player left:', socket.id));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

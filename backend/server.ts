import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Generate 10 unique basic trivia Qs from OpenAI (mixed categories)
async function generateQuestions(): Promise<any[]> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",  // Efficient for trivia
      messages: [
        {
          role: "system",
          content: `Generate 10 unique multiple-choice trivia questions for a basic-level knowledge game (general awareness, not professional/expert). Mix these categories evenly: General Knowledge, Geography, History, Science, Technology, Sports, Movies & TV, Music, Literature, Food & Drink, Business & Economics, Politics & Governance, Space & Astronomy, Inventions & Discoveries, Logic & Riddles, Famous Personalities, Nature & Environment, Gaming, Religion & Mythology, Travel & Culture, Trends & News (use current date October 24, 2025 for trends/news—recent events only).

One-word answers only. 4 options per Q (A, B, C, D—correct answer D). No repeats across Qs. Format: JSON array of {q: 'question?', options: ['A option', 'B option', 'C option', 'D correct'], correct: 'D'}. No explanations.`
        }
      ],
      max_tokens: 800,
      temperature: 0.6,  // Balanced variety
    });
    const generated = JSON.parse(completion.choices[0].message.content || '[]');
    return generated.slice(0, 10);  // Ensure 10
  } catch (error) {
    console.error('AI gen failed:', error);
    return [];  // Fallback empty—add static if needed
  }
}

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
          const allQuestions = await generateQuestions();
          games[poolId] = { 
            questions: allQuestions,
            players: pools[poolId].playerList.map(w => ({ wallet: w, score: 0 })),
            currentQ: 0 
          };
          io.to(poolId).emit('gameStart', { 
            poolId, 
            questions: games[poolId].questions,
            players: games[poolId].players 
          });
          console.log(`Game started in ${poolId} pool with 10 AI questions!`);
        }
      } else {
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
      // Instant next on submit (speed test)
      socket.emit('nextQuestion', { poolId });
      console.log(`Answer submitted in ${poolId}: ${wallet.slice(0,6)}... scored? ${answer === games[poolId].questions[qIndex].correct} — next Q!`);
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

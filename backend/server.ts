import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
  '0.10': { id: '0.10', stake: '$0.10', players: 0, playerList: [] },
  '1': { id: '1', stake: '$1', players: 0, playerList: [] },
  '5': { id: '5', stake: '$5', players: 0, playerList: [] },
  '10': { id: '10', stake: '$10', players: 0, playerList: [] },
};

interface PlayerData { wallet: string; score: number; currentQ: number; totalTime: number; shuffledQs: any[]; }
const games: { [poolId: string]: { questions: any[]; players: PlayerData[]; startTime: number; } } = {};

// Generate 10 unique basic trivia Qs from Gemini
async function generateQuestions(): Promise<any[]> {
  let attempts = 0;
  while (attempts < 3) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `Generate exactly 10 unique multiple-choice trivia questions for a general audience knowledge game (grade 10-12 level, basic awareness—not too simple for students or too difficult for professionals). Mix these categories evenly: General Knowledge, Geography, History, Science, Technology, Sports, Movies & TV, Music, Literature, Food & Drink, Business & Economics, Politics & Governance, Space & Astronomy, Inventions & Discoveries, Logic & Riddles, Famous Personalities, Nature & Environment, Gaming, Religion & Mythology, Travel & Culture, Trends & News (use current date October 25, 2025 for trends/news—recent events only). No repeats from previous games.

One-word answers only. 4 options per Q (A, B, C, D—correct answer D). Output ONLY valid JSON array with exactly 10 items: [{"q": "question?", "options": ["A option", "B option", "C option", "D correct"], "correct": "D"}]. No markdown, no code blocks, no explanations.`;

      const result = await model.generateContent(prompt);
      let content = result.response.text().trim();
      content = content.replace(/```json\n?|\n?```/g, '').trim();
      if (!content) throw new Error('Empty response');
      const generated = JSON.parse(content);
      if (!Array.isArray(generated)) throw new Error('Not array');
      if (generated.length < 10) {
        attempts++;
        console.log(`Gen attempt ${attempts}: Only ${generated.length} Qs—retrying.`);
        continue;
      }
      console.log(`Gemini gen success: 10 unique Qs ready!`);
      return generated.slice(0, 10);
    } catch (error) {
      attempts++;
      console.error(`Gen attempt ${attempts} failed:`, error);
      if (attempts >= 3) throw new Error('Gemini gen failed after 3 attempts—retry stake.');
    }
  }
  throw new Error('Gen loop exited—retry stake.');
}

io.on('connection', (socket: Socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinPool', async (data: { poolId: string; wallet: string }) => {
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
          let playerData = games[poolId].players.find(p => p.wallet === wallet);
          if (!playerData) {
            playerData = { wallet, score: 0, currentQ: 0, totalTime: 0, shuffledQs: [] };
            games[poolId].players.push(playerData);
          }
          if (playerData.shuffledQs.length === 0) {
            playerData.shuffledQs = [...games[poolId].questions].sort(() => Math.random() - 0.5);
          }
          socket.emit('gameState', {
            questions: playerData.shuffledQs,
            currentQ: playerData.currentQ,
            players: games[poolId].players,
            startTime: games[poolId].startTime
          });
        }

        if (pools[poolId].players >= 1 && !games[poolId]) {
          try {
            const allQuestions = await generateQuestions();
            const baseShuffled = [...allQuestions].sort(() => Math.random() - 0.5);
            games[poolId] = { 
              questions: allQuestions,
              players: pools[poolId].playerList.map(w => ({ wallet: w, score: 0, currentQ: 0, totalTime: 0, shuffledQs: baseShuffled.map((q, i) => ({ ...q, index: i })) })),
              startTime: Date.now()
            };
            io.to(poolId).emit('gameStart', { 
              poolId, 
              questions: games[poolId].questions,
              players: games[poolId].players,
              startTime: games[poolId].startTime
            });
            console.log(`Game started in ${poolId} pool with 10 unique Gemini AI questions!`);
          } catch (error) {
            console.error(`Gemini gen error in ${poolId}:`, error);
            socket.emit('error', { message: 'Questions gen failed after retries—try stake again!' });
          }
        }
      } else {
        socket.join(poolId);
        if (games[poolId]) {
          let playerData = games[poolId].players.find(p => p.wallet === wallet);
          if (!playerData) {
            playerData = { wallet, score: 0, currentQ: 0, totalTime: 0, shuffledQs: [] };
            games[poolId].players.push(playerData);
          }
          const shuffledQs = playerData.shuffledQs || [...games[poolId].questions].sort(() => Math.random() - 0.5);
          socket.emit('gameState', {
            questions: shuffledQs,
            currentQ: playerData.currentQ,
            players: games[poolId].players,
            startTime: games[poolId].startTime
          });
        }
        console.log(`Player ${wallet.slice(0,6)}... re-joined ${poolId}—sent shuffled state.`);
      }
    }
  });

  socket.on('submitAnswer', (data: { poolId: string; wallet: string; answer: string; qIndex: number; submitTime: number }) => {
    const { poolId, wallet, answer, qIndex, submitTime } = data;
    if (games[poolId]) {
      const player = games[poolId].players.find(p => p.wallet === wallet);
      if (player && player.currentQ === qIndex) {
        if (answer === player.shuffledQs[qIndex].correct) {
          player.score += 1;
        }
        player.totalTime += submitTime;
        player.currentQ += 1;
        io.to(poolId).emit('scoreUpdate', { 
          poolId, 
          players: games[poolId].players, 
          currentQ: player.currentQ 
        });
        // Advance this player only
        if (player.currentQ < 10) {
          socket.emit('nextQuestion', { poolId, qIndex: player.currentQ });
        } else {
          // Check if all players ended
          if (games[poolId].players.every(p => p.currentQ >= 10)) {
            const totalPool = pools[poolId].players * parseFloat(poolId);
            const sortedPlayers = games[poolId].players.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime);
            const prizes = sortedPlayers.slice(0, 3).map((p, i) => ({ 
              wallet: p.wallet, 
              prize: (totalPool * (i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2) * 0.9).toFixed(2) 
            }));
            io.to(poolId).emit('gameEnd', { poolId, prizes, finalScores: sortedPlayers });
            console.log(`Game ended in ${poolId}: Winners ${prizes.map(p => p.wallet.slice(0,6)).join(', ')}`);
          }
        }
        console.log(`Answer submitted in ${poolId}: ${wallet.slice(0,6)}... scored? ${answer === player.shuffledQs[qIndex].correct} — advanced to Q ${player.currentQ + 1}!`);
      }
    }
  });

  socket.on('timeout', (data: { poolId: string; wallet: string; qIndex: number; timeoutTime: number }) => {
    const { poolId, wallet, qIndex, timeoutTime } = data;
    if (games[poolId]) {
      const player = games[poolId].players.find(p => p.wallet === wallet);
      if (player && player.currentQ === qIndex) {
        player.totalTime += timeoutTime;
        player.currentQ += 1;
        io.to(poolId).emit('scoreUpdate', { 
          poolId, 
          players: games[poolId].players, 
          currentQ: player.currentQ 
        });
        if (player.currentQ < 10) {
          socket.emit('nextQuestion', { poolId, qIndex: player.currentQ });
        } else {
          if (games[poolId].players.every(p => p.currentQ >= 10)) {
            const totalPool = pools[poolId].players * parseFloat(poolId);
            const sortedPlayers = games[poolId].players.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime);
            const prizes = sortedPlayers.slice(0, 3).map((p, i) => ({ 
              wallet: p.wallet, 
              prize: (totalPool * (i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2) * 0.9).toFixed(2) 
            }));
            io.to(poolId).emit('gameEnd', { poolId, prizes, finalScores: sortedPlayers });
            console.log(`Game ended in ${poolId}: Winners ${prizes.map(p => p.wallet.slice(0,6)).join(', ')}`);
          }
        }
        console.log(`Timeout in ${poolId}: ${wallet.slice(0,6)}... advanced to Q ${player.currentQ + 1}!`);
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

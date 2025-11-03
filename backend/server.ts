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
interface GameState { questions: any[]; players: PlayerData[]; startTime: number; gameId: number; }
const games: { [poolId: string]: GameState } = {};

// -------------------------------------------------
async function generateQuestions(): Promise<any[]> {
  let attempts = 0;
  while (attempts < 3) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `Generate exactly 10 unique multiple-choice trivia questions for a general audience knowledge game (grade 10-12 level, basic awareness—not too simple for students or too difficult for professionals). Mix these categories evenly: General Knowledge, Geography, History, Science, Technology, Sports, Movies & TV, Music, Literature, Food & Drink, Business & Economics, Politics & Governance, Space & Astronomy, Inventions & Discoveries, Logic & Riddles, Famous Personalities, Nature & Environment, Gaming, Religion & Mythology, Travel & Culture, Trends & News (use current date November 03, 2025 for trends/news—recent events only). No repeats from previous games.

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
// -------------------------------------------------

io.on('connection', (socket: Socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinPool', async (data: { poolId: string; wallet: string }) => {
    const { poolId, wallet } = data;
    if (!pools[poolId]) return;

    // ---- add to pool list ----
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
    } else {
      socket.join(poolId);
    }

    // ---- reset finished game ----
    if (games[poolId] && games[poolId].players.every(p => p.currentQ >= 10)) {
      delete games[poolId];
      console.log(`Reset game state for ${poolId}—new round!`);
    }

    // ---- existing game (mid‑join or reconnect) ----
    if (games[poolId]) {
      let playerData = games[poolId].players.find(p => p.wallet === wallet);
      if (!playerData) {
        playerData = { wallet, score: 0, currentQ: 0, totalTime: 0, shuffledQs: [] };
        games[poolId].players.push(playerData);
      }

      // ONE‑TIME SHUFFLE
      if (playerData.shuffledQs.length === 0) {
        if (games[poolId].players.length > 1) {
          // copy from the first player (same order for everybody)
          const first = games[poolId].players[0];
          playerData.shuffledQs = JSON.parse(JSON.stringify(first.shuffledQs));
        } else {
          // first player → fresh shuffle
          playerData.shuffledQs = JSON.parse(JSON.stringify(games[poolId].questions))
                                    .sort(() => Math.random() - 0.5);
        }
      }

      socket.emit('gameState', {
        questions: playerData.shuffledQs,
        currentQ: playerData.currentQ,
        players: games[poolId].players,
        startTime: games[poolId].startTime,
        gameId: games[poolId].gameId
      });
    }

    // ---- brand‑new game ----
    if (pools[poolId].players >= 1 && !games[poolId]) {
      try {
        const allQuestions = await generateQuestions();
        games[poolId] = {
          questions: allQuestions,
          players: pools[poolId].playerList.map(w => ({
            wallet: w,
            score: 0,
            currentQ: 0,
            totalTime: 0,
            shuffledQs: []               // will be filled on first join (above)
          })),
          startTime: Date.now(),
          gameId: Date.now()
        };

        // first player will get the shuffle when the `joinPool` block runs again
        io.to(poolId).emit('gameStart', {
          poolId,
          questions: games[poolId].questions,
          players: games[poolId].players,
          startTime: games[poolId].startTime,
          gameId: games[poolId].gameId
        });
        console.log(`New game started in ${poolId} (ID: ${games[poolId].gameId})`);
      } catch (e) {
        console.error(`Gemini gen error in ${poolId}:`, e);
        socket.emit('error', { message: 'Questions gen failed after retries—try stake again!' });
      }
    }
  });

  // -------------------------------------------------
  socket.on('submitAnswer', (data: { poolId: string; wallet: string; answer: string; qIndex: number; submitTime: number }) => {
    const { poolId, wallet, answer, qIndex, submitTime } = data;
    if (!games[poolId]) return;

    const player = games[poolId].players.find(p => p.wallet === wallet);
    if (!player || player.currentQ !== qIndex || !player.shuffledQs[qIndex]) return;

    const correctOpt = player.shuffledQs[qIndex].options[3]?.trim().toLowerCase();
    const submitted = answer.trim().toLowerCase();

    if (submitted === correctOpt) {
      player.score += 1;
      console.log(`CORRECT! ${wallet.slice(0,6)}... got Q${qIndex + 1} right. Score: ${player.score}`);
    } else {
      console.log(`WRONG! ${wallet.slice(0,6)}... submitted "${submitted}", expected "${correctOpt}"`);
    }

    player.totalTime += submitTime;
    player.currentQ += 1;

    io.to(poolId).emit('scoreUpdate', { players: games[poolId].players });

    if (player.currentQ < 10) {
      socket.emit('nextQuestion', { poolId, qIndex: player.currentQ });
    } else {
      if (games[poolId].players.every(p => p.currentQ >= 10)) {
        const totalPool = pools[poolId].players * parseFloat(poolId);
        const sorted = games[poolId].players.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime);
        const prizes = sorted.slice(0, 3).map((p, i) => ({
          wallet: p.wallet,
          prize: (totalPool * (i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2) * 0.9).toFixed(2)
        }));
        io.to(poolId).emit('gameEnd', { poolId, prizes, finalScores: sorted });
        console.log(`Game ended in ${poolId} (ID: ${games[poolId].gameId}): Winners ${prizes.map(p => p.wallet.slice(0,6)).join(', ')}`);
        delete games[poolId];
      }
    }
  });

  // -------------------------------------------------
  socket.on('timeout', (data: { poolId: string; wallet: string; qIndex: number; timeoutTime: number }) => {
    const { poolId, wallet, qIndex, timeoutTime } = data;
    if (!games[poolId]) return;

    const player = games[poolId].players.find(p => p.wallet === wallet);
    if (!player || player.currentQ !== qIndex) return;

    player.totalTime += timeoutTime;
    player.currentQ += 1;
    io.to(poolId).emit('scoreUpdate', { players: games[poolId].players });

    if (player.currentQ < 10) {
      socket.emit('nextQuestion', { poolId, qIndex: player.currentQ });
    } else {
      if (games[poolId].players.every(p => p.currentQ >= 10)) {
        const totalPool = pools[poolId].players * parseFloat(poolId);
        const sorted = games[poolId].players.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime);
        const prizes = sorted.slice(0, 3).map((p, i) => ({
          wallet: p.wallet,
          prize: (totalPool * (i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2) * 0.9).toFixed(2)
        }));
        io.to(poolId).emit('gameEnd', { poolId, prizes, finalScores: sorted });
        delete games[poolId];
      }
    }
    console.log(`Timeout in ${poolId}: ${wallet.slice(0,6)}... advanced to Q ${player.currentQ + 1}!`);
  });

  socket.on('leavePool', (poolId: string) => socket.leave(poolId));
  socket.on('disconnect', () => console.log('Player left:', socket.id));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

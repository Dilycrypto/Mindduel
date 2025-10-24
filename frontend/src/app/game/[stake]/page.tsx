'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';

export default function Game() {
  const params = useParams();
  const stake = params.stake as string;
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(7);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [players, setPlayers] = useState<any[]>([]);
  const [gameEnded, setGameEnded] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) setWalletAddress(savedAddress);

    const newSocket = io('https://mindduel-1-h2cm.onrender.com');
    newSocket.on('connect', () => {
      console.log('Game socket connected!');
      if (walletAddress) {
        newSocket.emit('joinPool', { poolId: stake, wallet: walletAddress });
      }
    });
    newSocket.on('gameStart', (data: any) => {
      console.log('Game starting!');
      setQuestions(data.questions);
      setCurrentQ(0);
      setTimeLeft(7);
      setPlayers(data.players || []);
      setErrorMsg('');
    });
    newSocket.on('gameState', (data: any) => {
      console.log('Joining mid-game:', data);
      setQuestions(data.questions);
      setCurrentQ(data.currentQ);
      setTimeLeft(7);
      setPlayers(data.players || []);
      setErrorMsg('');
    });
    newSocket.on('nextQuestion', (data: any) => {
      setCurrentQ(data.qIndex);
      setTimeLeft(7);
      setSelectedAnswer('');
    });
    newSocket.on('scoreUpdate', (data: any) => {
      setPlayers(data.players);
      const me = data.players.find((p: any) => p.wallet === walletAddress);
      if (me) setMyScore(me.score);
    });
    newSocket.on('gameEnd', (data: any) => {
      setGameEnded(true);
      const myPrize = data.prizes.find((p: any) => p.wallet === walletAddress);
      alert(`Game Over! Your score: ${myScore}/10. Prize: ${myPrize ? `$${myPrize.prize} tUSDC` : 'None—sharpen those skills!'} (Mock payout)`);
    });
    newSocket.on('error', (err: any) => {
      console.log('Socket error:', err.message);
      setErrorMsg(err.message);  // Show on page, not alert
    });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [walletAddress, stake]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (currentQ < questions.length && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (timeLeft === 0) {
      socket?.emit('nextQuestion', { poolId: stake });
    }
    return () => clearTimeout(timer);
  }, [timeLeft, currentQ, selectedAnswer, questions.length, stake]);

  const submitAnswer = (answer: string) => {
    if (selectedAnswer || !walletAddress) return;
    setSelectedAnswer(answer);
    socket?.emit('submitAnswer', { 
      poolId: stake, 
      wallet: walletAddress, 
      answer, 
      qIndex: currentQ 
    });
  };

  if (gameEnded) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-4xl mb-4">Duel Complete!</h1>
          <p className="text-2xl mb-4">Your Final Score: {myScore}/10</p>
          <button 
            onClick={() => router.push('/lobby')} 
            className="bg-blue-500 hover:bg-blue-700 px-6 py-3 rounded-lg font-bold"
          >
            Back to Lobby
          </button>
        </div>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Joining duel... (Connect wallet if needed)</p>
          <p className="text-gray-400 mb-2">Console: Check for "Game socket connected!"</p>
          {errorMsg && <p className="text-red-400 mb-2">Error: {errorMsg}</p>}
          <p className="text-sm text-gray-500">If stuck, refresh page.</p>
        </div>
      </main>
    );
  }

  const q = questions[currentQ];

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-6 p-4 bg-gray-800 rounded">
          <h1 className="text-2xl font-bold">MindDuel: {stake} Pool</h1>
          <div className="text-right space-y-1">
            <p className="text-lg">⏱️ {timeLeft}s</p>
            <p>Q {currentQ + 1}/10</p>
            <p>Score: {myScore}</p>
          </div>
        </header>

        <section className="mb-6">
          <h2 className="text-xl font-bold mb-3">Live Leaderboard</h2>
          <ul className="bg-gray-800 p-4 rounded overflow-y-auto max-h-48">
            {players.length > 0 ? players.sort((a: any, b: any) => b.score - a.score).map((p: any, i: number) => (
              <li key={p.wallet} className={`flex justify-between py-2 border-b border-gray-700 last:border-b-0 ${p.wallet === walletAddress ? 'text-yellow-400' : ''}`}>
                <span>#{i + 1} {p.wallet.slice(0, 6)}...</span>
                <span className="font-bold">{p.score}/10</span>
              </li>
            )) : <li className="py-2 text-gray-400">Players loading...</li>}
          </ul>
        </section>

        <section className="bg-blue-900 p-6 rounded-lg mb-6">
          <h2 className="text-2xl font-bold mb-6 text-center">{q?.q}</h2>
          <div className="grid grid-cols-2 gap-4">
            {q?.options.map((opt: string, i: number) => (
              <button
                key={opt}
                onClick={() => submitAnswer(opt)}
                disabled={!!selectedAnswer}
                className={`p-4 rounded-lg font-semibold transition-colors ${
                  selectedAnswer === opt 
                    ? 'bg-green-500 text-white' 
                    : !selectedAnswer 
                      ? 'bg-gray-700 hover:bg-gray-600' 
                      : 'bg-gray-600 opacity-50 cursor-not-allowed'
                }`}
              >
                {String.fromCharCode(65 + i)}. {opt}
              </button>
            ))}
          </div>
        </section>

        <button 
          onClick={() => router.push('/lobby')} 
          className="bg-red-500 hover:bg-red-700 px-6 py-3 rounded-lg font-bold"
        >
          Quit Duel (Forfeit)
        </button>
      </div>
    </main>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';  // Add import

export default function Lobby() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [pools, setPools] = useState<any>({
    '0.50': { players: 5, playerList: ['0xabc...', '0xdef...'] },
    '1': { players: 12, playerList: ['0xghi...', '0xjkl...'] },
    '5': { players: 8, playerList: ['0xmno...'] },
    '10': { players: 3, playerList: [] },
  });
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) {
      setWalletAddress(savedAddress);
    }

    // Connect Socket after wallet
    if (savedAddress) {
      const newSocket = io('https://mindduel-backend-[your-backend-slug].onrender.com');  // Your backend URL
      newSocket.on('connect', () => console.log('Socket connected!'));
      newSocket.on('poolUpdate', (data: any) => {
        setPools((prev: any) => ({ ...prev, [data.poolId]: { players: data.players, playerList: data.playerList } }));
        console.log('Live update:', data);
      });
      newSocket.on('error', (err: any) => alert(err.message));
      setSocket(newSocket);

      return () => newSocket.close();
    }

    // Countdown (unchanged)
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          alert('New game starting!');
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [walletAddress]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const joinPool = (stake: string) => {
    if (!walletAddress || !socket) {
      alert('Connect wallet or check connection!');
      return;
    }
    socket.emit('joinPool', { poolId: stake.replace('$', ''), wallet: walletAddress });
    // No alert—wait for live update!
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">Lobby: Pick Your Duel</h1>
        {!walletAddress ? (
          <div className="text-center">
            <p>Connect wallet to join.</p>
          </div>
        ) : (
          <>
            <p className="text-center mb-8">Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
            
            <section className="mb-8">
              <h2 className="text-2xl mb-4">Next Game Starts In:</h2>
              <div className="text-4xl font-mono text-center bg-blue-800 p-4 rounded">
                {formatTime(timeLeft)}
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-4">Choose Stake Level</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(pools).map((key) => {
                  const pool = pools[key];
                  const stake = key === '0.50' ? '$0.50' : `$${key}`;
                  return (
                    <div key={stake} className="bg-gray-800 p-6 rounded-lg border-l-4 border-green-500">
                      <h3 className="text-xl font-bold">{stake} Pool</h3>
                      <p className="text-gray-300">Players: <span id={`players-${key}`}>{pool.players}</span></p>
                      <p className="text-sm text-gray-400 mb-4">Prize: Top {pool.players > 10 ? '10%' : '3'} share pool</p>
                      <button
                        onClick={() => joinPool(stake)}
                        className="w-full bg-green-500 hover:bg-green-700 py-2 rounded font-bold"
                      >
                        Join Now
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

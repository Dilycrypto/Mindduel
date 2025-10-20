'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';  // For potential redirects later

export default function Lobby() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);  // 5 mins countdown in seconds

  useEffect(() => {
    // Check if wallet connected (from localStorage for demo)
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) {
      setWalletAddress(savedAddress);
    }

    // Countdown timer
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          alert('New game starting!');  // Mock start
          return 300;  // Reset
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const joinPool = (stake: string) => {
    if (!walletAddress) {
      alert('Connect wallet first!');
      return;
    }
    console.log(`Joined ${stake} pool!`);  // Later: Real join via backend
    alert(`Staked ${stake}—Game in ${formatTime(timeLeft)}!`);
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">Lobby: Pick Your Duel</h1>
        {!walletAddress ? (
          <div className="text-center">
            <p>Connect wallet to join.</p>
            {/* Add back connect button if needed */}
          </div>
        ) : (
          <>
            <p className="text-center mb-8">Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
            
            {/* Upcoming Games Section */}
            <section className="mb-8">
              <h2 className="text-2xl mb-4">Next Game Starts In:</h2>
              <div className="text-4xl font-mono text-center bg-blue-800 p-4 rounded">
                {formatTime(timeLeft)}
              </div>
            </section>

            {/* Pool Tiers */}
            <section>
              <h2 className="text-2xl mb-4">Choose Stake Level</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { stake: '$0.50', players: 5, prize: 'Top 3 share $2' },
                  { stake: '$1', players: 12, prize: 'Top 5 share $8' },
                  { stake: '$5', players: 8, prize: 'Top 4 share $40' },
                  { stake: '$10', players: 3, prize: 'Top 2 share $80' },
                ].map((pool) => (
                  <div key={pool.stake} className="bg-gray-800 p-6 rounded-lg border-l-4 border-green-500">
                    <h3 className="text-xl font-bold">{pool.stake} Pool</h3>
                    <p className="text-gray-300">Players: {pool.players}</p>
                    <p className="text-sm text-gray-400 mb-4">{pool.prize}</p>
                    <button
                      onClick={() => joinPool(pool.stake)}
                      className="w-full bg-green-500 hover:bg-green-700 py-2 rounded font-bold"
                    >
                      Join Now
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

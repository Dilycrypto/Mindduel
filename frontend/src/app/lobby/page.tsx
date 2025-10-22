'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x7Eba683b9cFB85A46cb795B5c84dCD327c777fa3';  // Your deployed addr
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';  // Sepolia USDC

const CONTRACT_ABI = [
  "function joinTournament(uint256 _stakeAmount) external",
  "event TournamentJoined(uint256 indexed tournamentId, address indexed player, uint256 stake)"
];

export default function Lobby() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [pools, setPools] = useState<any>({
    '0.50': { players: 5, playerList: ['0xabc...', '0xdef...'] },
    '1': { players: 12, playerList: ['0xghi...', '0xjkl...'] },
    '5': { players: 8, playerList: ['0xmno...'] },
    '10': { players: 3, playerList: [] },
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  useEffect(() => {
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) setWalletAddress(savedAddress);

    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const newProvider = new ethers.BrowserProvider((window as any).ethereum);
      setProvider(newProvider);
    }

    if (savedAddress) {
      const newSocket = io('https://mindduel-1-h2cm.onrender.com');
      newSocket.on('connect', () => console.log('Lobby socket connected!'));
      newSocket.on('poolUpdate', (data: any) => {
        setPools((prev: any) => ({ ...prev, [data.poolId]: { players: data.players, playerList: data.playerList } }));
      });
      newSocket.on('error', (err: any) => alert(err.message));
      setSocket(newSocket);

      return () => newSocket.disconnect();
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          alert('New game starting soon—join a pool!');
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

  const joinPool = async (stake: string) => {
    if (!walletAddress || !provider) {
      alert('Connect wallet first!');
      return;
    }
    const poolId = stake.replace('$', '');
    const stakeAmount = parseFloat(poolId) * 1e6;  // 6 decimals, e.g., 0.50 = 500000

    try {
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(USDC_ADDRESS, ['function approve(address,uint256) returns (bool)'], signer);
      const approveTx = await usdc.approve(CONTRACT_ADDRESS, stakeAmount);
      await approveTx.wait();
      alert(`Approved ${stake} tUSDC!`);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const joinTx = await contract.joinTournament(stakeAmount);
      await joinTx.wait();
      alert(`Staked ${stake}! Tx: ${joinTx.hash} (Check sepolia.etherscan.io/tx/${joinTx.hash})`);

      socket?.emit('joinPool', { poolId, wallet: walletAddress });
      router.push(`/game/${poolId}`);
    } catch (error) {
      alert('Stake failed: ' + (error as Error).message + ' (Check balance/gas/Sepolia?)');
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">Lobby: Pick Your Duel</h1>
        {!walletAddress ? (
          <div className="text-center">
            <p className="text-xl">Connect your wallet on the landing page to join.</p>
          </div>
        ) : (
          <>
            <p className="text-center mb-8 text-lg">Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
            
            <section className="mb-8">
              <h2 className="text-2xl mb-4 text-center">Next Round Starts In:</h2>
              <div className="text-4xl font-mono text-center bg-blue-800 p-6 rounded-lg">
                {formatTime(timeLeft)}
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-4">Choose Stake Level</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.keys(pools).map((key) => {
                  const pool = pools[key];
                  const stake = key === '0.50' ? '$0.50' : `$${key}`;
                  const winners = pool.players <= 10 ? 'Top 3' : pool.players <= 50 ? 'Top 10%' : 'Top 20%';
                  return (
                    <div key={stake} className="bg-gray-800 p-6 rounded-lg border-l-4 border-green-500">
                      <h3 className="text-xl font-bold mb-2">{stake} Pool</h3>
                      <p className="text-gray-300 mb-1">Players: <span className="font-bold">{pool.players}</span></p>
                      <p className="text-sm text-gray-400 mb-4">Winners: {winners} share pool (10% fee)</p>
                      <button
                        onClick={() => joinPool(stake)}
                        className="w-full bg-green-500 hover:bg-green-700 py-3 rounded font-bold transition-colors"
                      >
                        Stake & Duel Now
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

'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        await provider.send('eth_requestAccounts', []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setWalletAddress(address);
        setIsConnected(true);
        alert('Wallet connected!');  // Temp feedback
      } catch (error) {
        alert('Connection failed—check MetaMask.');
      }
    } else {
      alert('Please install MetaMask!');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-purple-900 to-blue-900 text-white">
      <h1 className="text-6xl font-bold mb-8">MindDuel</h1>
      <p className="text-xl mb-8">Stake Crypto. Battle Brains. Win Prizes.</p>
      {!isConnected ? (
        <button
          onClick={connectWallet}
          className="bg-green-500 hover:bg-green-700 px-6 py-3 rounded-lg text-lg font-bold"
        >
          Connect Wallet
        </button>
      ) : (
        <div className="text-center">
          <p className="mb-4">Connected: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</p>
          <p>Ready for duels!</p>
        </div>
      )}
    </main>
  );
  
  {isConnected && (
  <button
    onClick={async () => {
      const response = await fetch('https://mindduel-backend-xyz.onrender.com/health');  // Replace with YOUR backend URL
      if (response.ok) alert('Backend pinged—real-time ready!');
    }}
    className="bg-blue-500 hover:bg-blue-700 px-4 py-2 rounded mt-4"
  >
    Ping Backend
  </button>
)}
}

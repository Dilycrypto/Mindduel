'use client';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Link from 'next/link';

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';  // Sepolia USDC

const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState('0');

  const connectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        await provider.send('eth_requestAccounts', []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setWalletAddress(address);
        setIsConnected(true);
        localStorage.setItem('walletAddress', address);

        // Fetch USDC balance on Sepolia
        const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
        const bal = await usdc.balanceOf(address);
        setUsdcBalance(ethers.formatUnits(bal, 6));  // 6 decimals
      } catch (error) {
        alert('Connection failed—ensure Sepolia testnet!');
      }
    } else {
      alert('Install MetaMask!');
    }
  };

  const pingBackend = async () => {
    const response = await fetch('https://mindduel-1-h2cm.onrender.com/health');
    if (response.ok) alert('Backend good!');
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
          <p className="mb-4 text-green-300">tUSDC Balance: {usdcBalance}</p>
          <Link href="/lobby">
            <button className="bg-blue-500 hover:bg-blue-700 px-6 py-3 rounded-lg text-lg font-bold block mb-4">
              Enter Lobby
            </button>
          </Link>
          <button
            onClick={pingBackend}
            className="bg-gray-500 hover:bg-gray-700 px-4 py-2 rounded"
          >
            Ping Backend
          </button>
        </div>
      )}
    </main>
  );
}

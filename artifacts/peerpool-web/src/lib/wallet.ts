import { useState, useEffect, useCallback, createContext, useContext } from "react";

export interface WalletState {
  address: string | null;
  isConnecting: boolean;
  isAuthenticated: boolean;
  sessionToken: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sign: (message: string) => Promise<string | null>;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/\//g, "/");

function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem("peerpool_session_token");
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem("peerpool_session_token", token);
    } else {
      sessionStorage.removeItem("peerpool_session_token");
    }
  } catch {}
}

function getStoredAddress(): string | null {
  try {
    return sessionStorage.getItem("peerpool_address");
  } catch {
    return null;
  }
}

function setStoredAddress(addr: string | null): void {
  try {
    if (addr) {
      sessionStorage.setItem("peerpool_address", addr);
    } else {
      sessionStorage.removeItem("peerpool_address");
    }
  } catch {}
}

export function useWalletState(): WalletState {
  const [address, setAddress] = useState<string | null>(getStoredAddress);
  const [sessionToken, setSessionToken] = useState<string | null>(getStoredToken);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!sessionToken || !address) return;
    fetch(`${API_BASE}/auth/session`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((r) => {
        if (r.ok) {
          setIsAuthenticated(true);
        } else {
          setSessionToken(null);
          setStoredToken(null);
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, [sessionToken, address]);

  const sign = useCallback(async (message: string): Promise<string | null> => {
    const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth || !address) return null;
    try {
      const sig = await eth.request({
        method: "personal_sign",
        params: [message, address],
      });
      return sig as string;
    } catch {
      return null;
    }
  }, [address]);

  const connect = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) {
      alert("No EVM wallet detected. Please install MetaMask or a compatible wallet extension.");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts", params: [] }) as string[];
      const addr = accounts[0];
      setAddress(addr);
      setStoredAddress(addr);

      const nonceRes = await fetch(`${API_BASE}/auth/nonce?address=${addr}`);
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce, message } = await nonceRes.json() as { nonce: string; message: string };

      const sig = await eth.request({
        method: "personal_sign",
        params: [message, addr],
      }) as string;

      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, signature: sig, nonce }),
      });

      if (verifyRes.ok) {
        const { token } = await verifyRes.json() as { token: string };
        setSessionToken(token);
        setStoredToken(token);
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error("Wallet connect failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (sessionToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      }).catch(() => {});
    }
    setAddress(null);
    setSessionToken(null);
    setIsAuthenticated(false);
    setStoredToken(null);
    setStoredAddress(null);
  }, [sessionToken]);

  return { address, isConnecting, isAuthenticated, sessionToken, connect, disconnect, sign };
}

import { createContext as reactCreateContext } from "react";

export const WalletContext = createContext<WalletState>({
  address: null,
  isConnecting: false,
  isAuthenticated: false,
  sessionToken: null,
  connect: async () => {},
  disconnect: () => {},
  sign: async () => null,
});

export function useWallet(): WalletState {
  return useContext(WalletContext);
}

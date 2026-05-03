import {
  createWalletClient,
  custom,
  verifyMessage,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { randomBytes } from "crypto";

const DOMAIN_NAME = "PeerPool";
const DOMAIN_VERSION = "1";

const nonces = new Map<string, { nonce: string; expiresAt: number }>();

const NONCE_TTL_MS = 5 * 60 * 1000;

export function generateNonce(address: string): string {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(address.toLowerCase(), {
    nonce,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return nonce;
}

export function getNonce(address: string): string | null {
  const entry = nonces.get(address.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    nonces.delete(address.toLowerCase());
    return null;
  }
  return entry.nonce;
}

export function consumeNonce(address: string): string | null {
  const nonce = getNonce(address);
  if (nonce) nonces.delete(address.toLowerCase());
  return nonce;
}

export function buildSignMessage(address: string, nonce: string): string {
  return [
    "Sign in to PeerPool Protocol",
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    "",
    "This request will not trigger a blockchain transaction or cost any gas fees.",
  ].join("\n");
}

export async function verifySignature(params: {
  address: string;
  nonce: string;
  signature: Hex;
}): Promise<boolean> {
  const { address, nonce, signature } = params;

  const message = buildSignMessage(address, nonce);

  try {
    const valid = await verifyMessage({
      address: address as Address,
      message,
      signature,
    });
    return valid;
  } catch {
    return false;
  }
}

export const EIP712_DOMAIN = {
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  chainId: 1,
} as const;

export const SIGN_IN_TYPES = {
  SignIn: [
    { name: "address", type: "address" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "string" },
  ],
} as const;

export async function verifyEIP712Signature(params: {
  address: string;
  nonce: string;
  issuedAt: string;
  signature: Hex;
}): Promise<boolean> {
  const { address, nonce, issuedAt, signature } = params;

  try {
    const valid = await verifyTypedData({
      address: address as Address,
      domain: EIP712_DOMAIN,
      types: SIGN_IN_TYPES,
      primaryType: "SignIn",
      message: {
        address: address as Address,
        nonce,
        issuedAt,
      },
      signature,
    });
    return valid;
  } catch {
    return false;
  }
}

export interface AuthSession {
  address: string;
  issuedAt: number;
}

const activeSessions = new Map<string, AuthSession>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createSession(address: string): string {
  const token = randomBytes(32).toString("hex");
  activeSessions.set(token, {
    address: address.toLowerCase(),
    issuedAt: Date.now(),
  });
  return token;
}

export function getSession(token: string): AuthSession | null {
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

export function invalidateSession(token: string): void {
  activeSessions.delete(token);
}

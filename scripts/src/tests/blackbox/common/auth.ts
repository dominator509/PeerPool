import { privateKeyToAccount } from "viem/accounts";
import { readJson } from "./server";

interface NonceResponse {
  nonce: string;
  message: string;
  address: string;
}

interface VerifyResponse {
  token?: string;
  address: string;
}

const defaultPrivateKey =
  "0x4444444444444444444444444444444444444444444444444444444444444444";

export async function createAuthenticatedSession(
  baseUrl: string,
  privateKey = defaultPrivateKey,
): Promise<{ token: string; address: string }> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const nonceResponse = await fetch(`${baseUrl}/api/auth/nonce?address=${account.address}`);
  if (nonceResponse.status !== 200) {
    throw new Error(`Expected 200 from /api/auth/nonce, got ${nonceResponse.status}`);
  }

  const nonceBody = await readJson<NonceResponse>(nonceResponse);
  const signature = await account.signMessage({ message: nonceBody.message });

  const verifyResponse = await fetch(`${baseUrl}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: account.address,
      signature,
      nonce: nonceBody.nonce,
    }),
  });

  if (verifyResponse.status !== 200) {
    throw new Error(`Expected 200 from /api/auth/verify, got ${verifyResponse.status}`);
  }

  const verifyBody = await readJson<VerifyResponse>(verifyResponse);
  if (!verifyBody.token) {
    throw new Error("Auth verify did not return a token");
  }

  return {
    token: verifyBody.token,
    address: verifyBody.address,
  };
}


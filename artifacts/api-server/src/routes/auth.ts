import { Router } from "express";
import {
  generateNonce,
  consumeNonce,
  buildSignMessage,
  verifySignature,
  verifyEIP712Signature,
  createSession,
  getSession,
  invalidateSession,
  EIP712_DOMAIN,
  SIGN_IN_TYPES,
} from "../lib/auth.js";
import type { Hex } from "viem";

const router = Router();

router.get("/auth/nonce", (req, res) => {
  const { address } = req.query as { address?: string };
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: "Valid EVM address required" });
    return;
  }

  const nonce = generateNonce(address);
  const message = buildSignMessage(address, nonce);

  res.json({
    nonce,
    message,
    address,
    domain: EIP712_DOMAIN,
    types: SIGN_IN_TYPES,
  });
});

router.post("/auth/verify", async (req, res) => {
  try {
    const { address, signature, nonce, issuedAt, method = "personal_sign" } = req.body as {
      address?: string;
      signature?: string;
      nonce?: string;
      issuedAt?: string;
      method?: "personal_sign" | "eth_signTypedData_v4";
    };

    if (!address || !signature || !nonce) {
      res.status(400).json({ error: "address, signature, and nonce are required" });
      return;
    }

    const storedNonce = consumeNonce(address);
    if (!storedNonce || storedNonce !== nonce) {
      res.status(401).json({ error: "Invalid or expired nonce" });
      return;
    }

    let valid = false;

    if (method === "eth_signTypedData_v4" && issuedAt) {
      valid = await verifyEIP712Signature({
        address,
        nonce,
        issuedAt,
        signature: signature as Hex,
      });
    } else {
      valid = await verifySignature({
        address,
        nonce,
        signature: signature as Hex,
      });
    }

    if (!valid) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    const token = createSession(address);

    res.json({
      token,
      address: address.toLowerCase(),
      expiresIn: 86400,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Auth verification failed" });
  }
});

router.get("/auth/session", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  res.json({
    address: session.address,
    issuedAt: session.issuedAt,
    valid: true,
  });
});

router.post("/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token) {
    invalidateSession(token);
  }

  res.json({ ok: true });
});

export default router;

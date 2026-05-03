import type { Request, Response, NextFunction } from "express";
import { getSession } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.walletAddress = session.address;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token) {
    const session = getSession(token);
    if (session) {
      req.walletAddress = session.address;
    }
  }

  next();
}

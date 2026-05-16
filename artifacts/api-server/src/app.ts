import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { startIndexerSchedule } from "./lib/indexer";

const apiServerDir = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = process.env["PEERPOOL_WEB_DIST"]
  ? path.resolve(process.env["PEERPOOL_WEB_DIST"])
  : path.resolve(apiServerDir, "..", "..", "peerpool-web", "dist", "public");
const webIndexPath = path.join(webDistPath, "index.html");

const allowedOrigins: (string | RegExp)[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/.*\.replit\.dev$/,
  /^https?:\/\/.*\.repl\.co$/,
];
if (process.env["REPLIT_DOMAINS"]) {
  process.env["REPLIT_DOMAINS"]
    .split(",")
    .map((d) => `https://${d.trim()}`)
    .forEach((o) => allowedOrigins.push(o));
}

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI review rate limit reached, please try again in a minute." },
});

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/disputes", (req, res, next) => {
  if (req.path.endsWith("/ai-review") && req.method === "POST") {
    aiLimiter(req, res, next);
  } else {
    next();
  }
});

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

if (existsSync(webIndexPath)) {
  app.use(
    express.static(webDistPath, {
      index: false,
      immutable: process.env.NODE_ENV === "production",
      maxAge: process.env.NODE_ENV === "production" ? "1y" : 0,
      setHeaders(res, filePath) {
        if (filePath === webIndexPath) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      next();
      return;
    }

    if (req.path.startsWith("/api") || path.extname(req.path)) {
      next();
      return;
    }

    res.sendFile(webIndexPath);
  });
} else {
  logger.warn({ webDistPath }, "Built web frontend not found; serving API only");
}

startIndexerSchedule();

export default app;

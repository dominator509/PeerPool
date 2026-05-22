import { spawn } from "node:child_process";
import net from "node:net";

export const localDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgres://peerpool:peerpool@127.0.0.1:54329/peerpool";

export async function waitForLocalDatabase(timeoutMs = 60_000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(54329, "127.0.0.1");
        socket.once("connect", () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
        socket.setTimeout(2_000, () => {
          socket.destroy(new Error("Timed out connecting to local Postgres"));
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Local Postgres did not become ready: ${String(lastError)}`);
}

export async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const executable = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : command;
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(executable, commandArgs, {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

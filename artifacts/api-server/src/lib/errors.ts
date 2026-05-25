export function isDependencyFailure(err: unknown): boolean {
  const msg = String(err ?? "");
  return (
    msg.includes("Failed query") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Connection terminated unexpectedly") ||
    msg.includes("database") ||
    msg.includes("connect")
  );
}

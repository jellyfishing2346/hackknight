import "server-only";
import { NextResponse } from "next/server";

/**
 * A small per-visitor rate limit, so nobody can burn through the AI, voice, or payment
 * budgets by hammering a button or scripting requests.
 *
 * Counts live in memory on each server instance. That's enough to stop a single person or
 * script during a demo; it isn't a hard global cap across every instance.
 */
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

function clientId(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip");
  return ip?.trim() || "unknown";
}

/** Returns a 429 response if this visitor made more than `limit` requests to `name` in the window, else null. */
export function rateLimit(req: Request, name: string, limit: number, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  if (now - lastSweep > 5 * 60_000) {
    // Drop stale entries now and then so memory stays small.
    for (const [k, times] of hits) if (!times.some((t) => now - t < 10 * 60_000)) hits.delete(k);
    lastSweep = now;
  }
  const key = `${name}:${clientId(req)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const wait = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
    return NextResponse.json(
      { error: `You're going a little fast. Try again in ${wait < 60 ? `${wait} seconds` : "a minute"}.` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}

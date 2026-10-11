import "server-only";

/**
 * True when Gemini failed because it's out of quota or temporarily overloaded,
 * rather than because of something about this particular request.
 */
export function aiIsBusy(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  const status = e?.status ?? e?.code;
  if (status === 429 || status === 503) return true;
  const msg = String(e?.message ?? err ?? "");
  return /RESOURCE_EXHAUSTED|quota|rate limit|overloaded|UNAVAILABLE|\b429\b|\b503\b/i.test(msg);
}

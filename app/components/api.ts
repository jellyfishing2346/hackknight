/**
 * Read a JSON response, turning server crashes into a readable message instead of
 * "JSON.parse: unexpected end of data". Throws with the server's error text when not ok.
 */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: usually a crash page from the host.
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(
      msg ??
        `The server had a problem (error ${res.status}). If this is a new deployment, check that its environment variables are set.`,
    );
  }
  if (data === null) throw new Error("The server sent an empty response. Check that the deployment's environment variables are set.");
  return data as T;
}

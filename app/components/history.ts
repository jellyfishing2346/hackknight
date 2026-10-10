/** Tabs this browser has hosted, newest first. We only keep ids — everything else is fetched live. */
const KEY = "tabby:history";

export function addToHistory(id: string) {
  try {
    const ids = readHistory().filter((x) => x !== id);
    ids.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 100)));
  } catch {}
}

export function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function removeFromHistory(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readHistory().filter((x) => x !== id)));
  } catch {}
}

import { loadBill } from "@/lib/bills";
import { sameName, split } from "@/lib/split";

export const maxDuration = 30;

// Spoken amounts read better than "$41.00": "41 dollars", "13 dollars and 88 cents".
function spoken(n: number) {
  const dollars = Math.floor(n + 1e-9);
  const cents = Math.round((n - dollars) * 100);
  const d = `${dollars} ${dollars === 1 ? "dollar" : "dollars"}`;
  const c = `${cents} ${cents === 1 ? "cent" : "cents"}`;
  if (dollars === 0) return c;
  return cents ? `${d} and ${c}` : d;
}

// Same sentence, same audio: cache it so repeat announcements don't spend credits.
const cache = new Map<string, ArrayBuffer>();

/**
 * Speak a payment event for a bill. The server writes the sentence from the real bill state,
 * so this can't be used to make the voice say arbitrary text.
 */
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "Announcements aren't set up: add ELEVENLABS_API_KEY." }, { status: 503 });

  const { billId, kind, name } = (await req.json()) as { billId?: string; kind?: "paid" | "settled" | "test"; name?: string };
  if (!billId) return Response.json({ error: "Missing bill." }, { status: 400 });
  const state = await loadBill(billId);
  if (!state) return Response.json({ error: "Bill not found." }, { status: 404 });

  const s = split(state.bill, state.items, state.payments);
  const host = state.bill.host_name;
  let text: string;
  if (kind === "test") {
    text = `Announcements are on. I'll call out payments as they land.`;
  } else if (kind === "paid") {
    const g = s.guests.find((x) => sameName(x.name, name));
    if (!g || !(g.owed > 0 && g.settled)) return Response.json({ error: "Nothing to announce." }, { status: 409 });
    text = `${g.name} just paid ${host} back ${spoken(g.paid)}.`;
  } else if (kind === "settled") {
    if (!s.settled) return Response.json({ error: "Not settled yet." }, { status: 409 });
    text = `That's everyone. ${host} is all square.`;
  } else {
    return Response.json({ error: "Unknown announcement." }, { status: 400 });
  }

  let audio = cache.get(text);
  if (!audio) {
    const voice = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5" }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("ElevenLabs failed:", res.status, detail);
      const hint = res.status === 401 ? " Check ELEVENLABS_API_KEY." : res.status === 404 ? " Check ELEVENLABS_VOICE_ID." : "";
      return Response.json({ error: `Voice service error (${res.status}).${hint}` }, { status: 502 });
    }
    audio = await res.arrayBuffer();
    cache.set(text, audio);
  }
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}

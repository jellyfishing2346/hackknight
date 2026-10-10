import { NextResponse } from "next/server";

export const maxDuration = 30;

/** Voice to text with ElevenLabs Scribe. The browser sends a short recording; we return the words. */
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice input isn't set up: add ELEVENLABS_API_KEY." }, { status: 503 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "No recording was sent." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "That recording is too long. Try a shorter one." }, { status: 413 });

  const upstream = new FormData();
  upstream.append("file", file, (file as File).name || "voice.webm");
  upstream.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: upstream,
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("ElevenLabs speech-to-text failed:", res.status, detail);
    const hint =
      res.status === 401 || res.status === 403
        ? " Your ElevenLabs key may not have Speech to Text access: turn it on in ElevenLabs → Developers → API Keys."
        : "";
    return NextResponse.json({ error: `Couldn't transcribe that (error ${res.status}).${hint}` }, { status: 502 });
  }
  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: (data.text ?? "").trim() });
}

"use client";
import { useEffect, useRef, useState } from "react";
import { readJson } from "@/app/components/api";
import type { TabbyDraft } from "@/lib/assistant";
import "./tabby-ai.css";

export type { TabbyDraft };

type Msg = { role: "user" | "assistant"; text: string };

const GREETING =
  "Hi! Tell me about the bill and I'll set it up. For example: \"Ski trip with friends, cabin was 420, gear rental 180, lift tickets 320, split evenly between 4 of us. I'm Sam and I paid.\"";

const money = (n: number) => `$${n.toFixed(2)}`;
const MAX_SECONDS = 60;

/** Pick an audio format this browser can record: webm on Chrome/Firefox, mp4 on Safari. */
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/**
 * "Tabby AI": describe a bill in plain words, typed or spoken, and get a ready-to-use bill.
 * Speech is transcribed by ElevenLabs Scribe; the bill is built by Gemini.
 */
export function TabbyAI({ onUse }: { onUse: (draft: TabbyDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: GREETING }]);
  const [draft, setDraft] = useState<TabbyDraft | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canRecord, setCanRecord] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const listEnd = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setCanRecord(!!navigator.mediaDevices?.getUserMedia && pickMime() !== null);
  }, []);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, draft, thinking]);

  // Stop the microphone if the panel closes mid-recording.
  useEffect(() => {
    if (!open && recorder.current?.state === "recording") recorder.current.stop();
  }, [open]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || thinking) return;
    const next: Msg[] = [...messages, { role: "user", text: t }];
    setMessages(next);
    setInput("");
    setError(null);
    setThinking(true);
    try {
      // The greeting is ours, not the model's, so it isn't sent.
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      const data = await readJson<{ reply: string; draft: TabbyDraft | null }>(res);
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
      if (data.draft) setDraft(data.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime() || undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) return; // too short to be speech
        await transcribe(blob);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) recorder.current?.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Couldn't use the microphone. Check that this site is allowed to use it, or type instead.");
    }
  }

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", blob, `voice.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await readJson<{ text: string }>(res);
      if (!data.text) {
        setError("I didn't catch that. Try again a little closer to the mic.");
        return;
      }
      // Put the words in the box so people can check them before sending.
      setInput((prev) => (prev ? `${prev} ${data.text}` : data.text));
      inputRef.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  }

  function startOver() {
    setMessages([{ role: "assistant", text: GREETING }]);
    setDraft(null);
    setInput("");
    setError(null);
  }

  const draftTotal = draft ? draft.items.reduce((s, i) => s + i.price, 0) + draft.tax + draft.tip : 0;

  return (
    <>
      {!open && (
        <button className="ai-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <span aria-hidden="true">✨</span> Tabby AI
        </button>
      )}

      {open && (
        <div className="ai-backdrop" onClick={() => setOpen(false)}>
          <section
            className="ai-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ai-head">
              <h2 id="ai-title"><span aria-hidden="true">✨</span> Tabby AI</h2>
              <div className="row">
                <button className="link quiet" onClick={startOver}>Start over</button>
                <button className="ai-close" onClick={() => setOpen(false)} aria-label="Close Tabby AI">×</button>
              </div>
            </header>

            <div className="ai-messages" aria-live="polite">
              {messages.map((m, i) => (
                <p key={i} className={`ai-msg ${m.role}`}>{m.text}</p>
              ))}

              {draft && (
                <div className="ai-draft">
                  <p className="ai-draft-title">{draft.merchant}</p>
                  {draft.items.map((it, i) => (
                    <div className="line" key={i}>
                      <span className="name">{it.name}</span>
                      <span className="price">{money(it.price)}</span>
                    </div>
                  ))}
                  <hr className="rule" />
                  <div className="line"><span>Tax</span><span className="price">{money(draft.tax)}</span></div>
                  <div className="line"><span>Tip</span><span className="price">{money(draft.tip)}</span></div>
                  <div className="line total"><span>Total</span><span className="price">{money(draftTotal)}</span></div>
                  <p className="ai-draft-mode">
                    {draft.splitMode === "even"
                      ? `Split evenly between ${draft.people} people · ${money(draftTotal / draft.people)} each`
                      : "Everyone pays for what they got"}
                    {draft.hostName && ` · ${draft.hostName} paid`}
                  </p>
                  <button
                    className="btn block"
                    onClick={() => {
                      onUse(draft);
                      setOpen(false);
                    }}
                  >
                    Use this bill →
                  </button>
                </div>
              )}

              {thinking && <p className="ai-msg assistant ai-typing">Tabby is thinking…</p>}
              <div ref={listEnd} />
            </div>

            {error && <p className="error ai-error">{error}</p>}

            <form
              className="ai-input"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              {canRecord && (
                <button
                  type="button"
                  className={`ai-mic${recording ? " on" : ""}`}
                  onClick={() => (recording ? recorder.current?.stop() : startRecording())}
                  disabled={transcribing || thinking}
                  aria-label={recording ? "Stop recording" : "Speak instead of typing"}
                  aria-pressed={recording}
                >
                  {recording ? "■" : "🎤"}
                </button>
              )}
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                placeholder={
                  recording ? `Listening… ${seconds}s · tap ■ when done` : transcribing ? "Turning your voice into text…" : "Describe your bill…"
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                disabled={recording || transcribing}
                aria-label="Describe your bill"
              />
              <button type="submit" className="btn small" disabled={!input.trim() || thinking || recording || transcribing}>
                Send
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

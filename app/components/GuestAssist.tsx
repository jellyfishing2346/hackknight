"use client";
import { useState } from "react";
import { readJson } from "@/app/components/api";
import { useRecorder } from "@/app/components/useRecorder";
import "./features.css";

type Match = { id: string; name: string; price: number; alreadyMine: boolean; sharedWith: string[] };

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * "Tell Tabby what you had": a guest types or says what was theirs, Gemini matches it to the
 * bill's items, and the guest confirms before anything is claimed.
 */
export function GuestAssist({
  billId,
  name,
  onApply,
}: {
  billId: string;
  name: string;
  onApply: (itemIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const mic = useRecorder((spoken) => {
    setText(spoken);
    ask(spoken); // spoken words go straight to matching; the guest still confirms the list
  });

  async function ask(said: string) {
    const t = said.trim();
    if (!t || busy) return;
    setBusy(true);
    setReply(null);
    setMatches(null);
    mic.setError(null);
    try {
      const res = await fetch(`/api/bills/${billId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text: t }),
      });
      const data = await readJson<{ reply: string; matches: Match[] }>(res);
      setReply(data.reply || null);
      setMatches(data.matches);
      setPicked(new Set(data.matches.filter((m) => !m.alreadyMine).map((m) => m.id)));
    } catch (e) {
      mic.setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBusy(true);
    await onApply(ids);
    setBusy(false);
    setDone(`Marked ${ids.length} ${ids.length === 1 ? "item" : "items"} as yours.`);
    setOpen(false);
    setText("");
    setMatches(null);
    setReply(null);
  }

  if (!open) {
    return (
      <div className="assist-entry">
        <button className="btn ghost assist-btn" onClick={() => { setOpen(true); setDone(null); }}>
          <span aria-hidden="true">🎤</span> Tell Tabby what you had
        </button>
        {done && <p className="assist-done">✓ {done}</p>}
      </div>
    );
  }

  const newOnes = matches?.filter((m) => !m.alreadyMine) ?? [];

  return (
    <div className="assist-card">
      <div className="assist-head">
        <strong>Tell Tabby what you had</strong>
        <button className="ai-close-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
      <p className="muted assist-sub">Say it or type it, in any language. For example: "I had the burrito and half the guac."</p>

      <form
        className="assist-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        {mic.canRecord && (
          <button
            type="button"
            className={`assist-mic${mic.recording ? " on" : ""}`}
            onClick={() => (mic.recording ? mic.stop() : mic.start())}
            disabled={mic.transcribing || busy}
            aria-label={mic.recording ? "Stop recording" : "Speak instead of typing"}
            aria-pressed={mic.recording}
          >
            {mic.recording ? "■" : "🎤"}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mic.recording ? `Listening… ${mic.seconds}s · tap ■ when done` : mic.transcribing ? "Turning your voice into text…" : "What did you have?"
          }
          disabled={mic.recording || mic.transcribing}
          aria-label="What did you have?"
        />
        <button type="submit" className="btn small" disabled={!text.trim() || busy || mic.recording || mic.transcribing}>
          {busy ? "…" : "Find"}
        </button>
      </form>

      {mic.error && <p className="error" style={{ margin: "0.6rem 0 0" }}>{mic.error}</p>}
      {busy && <p className="muted" style={{ margin: "0.7rem 0 0" }}>Finding your items…</p>}
      {reply && <p className="assist-reply">{reply}</p>}

      {matches && matches.length > 0 && (
        <>
          <ul className="assist-matches">
            {matches.map((m) => (
              <li key={m.id}>
                <label className={m.alreadyMine ? "already" : ""}>
                  <input
                    type="checkbox"
                    checked={m.alreadyMine || picked.has(m.id)}
                    disabled={m.alreadyMine}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        return next;
                      })
                    }
                  />
                  <span className="assist-item">
                    {m.name}
                    <span className="assist-note">
                      {m.alreadyMine
                        ? "already yours"
                        : m.sharedWith.length
                          ? `shared with ${m.sharedWith.join(", ")} · ${money(m.price / (m.sharedWith.length + 1))} each`
                          : money(m.price)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {newOnes.length > 0 && (
            <button className="btn block" onClick={apply} disabled={busy || picked.size === 0}>
              Yes, mark {picked.size === 1 ? "this as mine" : `these ${picked.size} as mine`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

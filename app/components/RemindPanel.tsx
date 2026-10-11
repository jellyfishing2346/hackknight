"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/split";
import "./features.css";

type Props = {
  billId: string;
  guest: string;
  amount: number;
  host: string;
  title: string;
  joinUrl: string;
  /** Called once the host actually sends or copies a reminder. */
  onSent: () => void;
  onClose: () => void;
};

/**
 * Remind someone who hasn't paid. Tabby doesn't have guests' phone numbers, so the host sends
 * it from their own apps: the message is written for them, one tap opens Messages, WhatsApp,
 * or email with it filled in. Or Tabby records a spoken voice note (ElevenLabs) to send instead.
 */
export function RemindPanel({ billId, guest, amount, host, title, joinUrl, onSent, onClose }: Props) {
  const [text, setText] = useState(
    `Hi ${guest}! Friendly reminder from ${host}: your share of "${title}" is ${money(amount)}. You can pay it back in one tap here: ${joinUrl}`,
  );
  const [note, setNote] = useState<string | null>(null);
  const [voice, setVoice] = useState<{ url: string; file: File } | null>(null);
  const [making, setMaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => () => {
    if (voice) URL.revokeObjectURL(voice.url);
  }, [voice]);

  // Close with the Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = encodeURIComponent(text);
  const subject = encodeURIComponent(`Your share of "${title}"`);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. Paste it into any message.");
      onSent();
    } catch {
      setNote("Couldn't copy. Select the message above and copy it.");
    }
  }

  async function makeVoiceNote() {
    setMaking(true);
    setVoiceError(null);
    try {
      const res = await fetch("/api/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId, kind: "reminder", name: guest }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error;
        throw new Error(msg || "Couldn't make the voice note.");
      }
      const blob = await res.blob();
      const file = new File([blob], `Reminder for ${guest}.mp3`, { type: "audio/mpeg" });
      setVoice({ url: URL.createObjectURL(blob), file });
    } catch (e) {
      setVoiceError((e as Error).message);
    } finally {
      setMaking(false);
    }
  }

  async function sendVoiceNote() {
    if (!voice) return;
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [voice.file] })) {
      try {
        await navigator.share({ files: [voice.file], text: `Your share of "${title}": ${joinUrl}` });
        onSent();
      } catch {
        // Cancelled: nothing to do.
      }
    }
  }

  const canShareFiles =
    typeof navigator !== "undefined" &&
    !!voice &&
    !!(navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }).canShare?.({ files: [voice.file] });

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet remind-sheet" role="dialog" aria-modal="true" aria-labelledby="remind-title" onClick={(e) => e.stopPropagation()}>
        <div className="assist-head">
          <h2 id="remind-title" style={{ margin: 0 }}>Remind {guest}</h2>
          <button className="ai-close-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="muted" style={{ margin: "0.3rem 0 0.8rem", fontSize: "0.92rem" }}>
          {guest} still owes {money(amount)}. Pick how to send it. You can edit the message first.
        </p>

        <textarea className="remind-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reminder message" />

        <div className="remind-actions">
          <a className="remind-action" href={`sms:?&body=${body}`} onClick={onSent}>
            <span aria-hidden="true">💬</span> Text message
          </a>
          <a className="remind-action" href={`https://wa.me/?text=${body}`} target="_blank" rel="noreferrer" onClick={onSent}>
            <span aria-hidden="true">🟢</span> WhatsApp
          </a>
          <a className="remind-action" href={`mailto:?subject=${subject}&body=${body}`} onClick={onSent}>
            <span aria-hidden="true">✉️</span> Email
          </a>
          <button type="button" className="remind-action" onClick={copy}>
            <span aria-hidden="true">📋</span> Copy
          </button>
        </div>
        {note && <p className="share-note" role="status" style={{ margin: "0.6rem 0 0" }}>{note}</p>}

        <div className="remind-voice">
          <strong>Or send a voice note</strong>
          <span className="muted">Tabby reads the reminder out loud, friendly and clear.</span>
          {!voice ? (
            <button type="button" className="btn ghost small" onClick={makeVoiceNote} disabled={making}>
              {making ? "Recording…" : "🔊 Make a voice note"}
            </button>
          ) : (
            <>
              <audio controls src={voice.url} style={{ width: "100%" }} />
              {canShareFiles ? (
                <button type="button" className="btn small" onClick={sendVoiceNote}>📤 Send voice note</button>
              ) : (
                <a className="btn small" href={voice.url} download={voice.file.name} onClick={onSent}>
                  ⬇️ Download to send
                </a>
              )}
            </>
          )}
          {voiceError && <p className="error" style={{ margin: 0 }}>{voiceError}</p>}
        </div>

        <button type="button" className="btn block" style={{ marginTop: "1rem" }} onClick={onClose}>Done</button>
      </section>
    </div>
  );
}

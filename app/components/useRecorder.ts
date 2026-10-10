"use client";
import { useEffect, useRef, useState } from "react";
import { readJson } from "@/app/components/api";

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
 * Record a short voice clip and turn it into text with ElevenLabs Scribe (via /api/transcribe).
 * Scribe detects the language automatically, so people can speak in whatever language they like.
 */
export function useRecorder(onText: (text: string) => void) {
  const [canRecord, setCanRecord] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCanRecord(!!navigator.mediaDevices?.getUserMedia && pickMime() !== null);
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", blob, `voice.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await readJson<{ text: string }>(res);
      if (!data.text) setError("I didn't catch that. Try again a little closer to the mic.");
      else onText(data.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime() || undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
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

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return { canRecord, recording, transcribing, seconds, error, setError, start, stop };
}

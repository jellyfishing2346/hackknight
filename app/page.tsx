"use client";
import { Brand } from "@/app/components/Brand";
import { Steps } from "@/app/components/Steps";
import { readJson } from "@/app/components/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { money, round2 } from "@/lib/split";
import type { ParsedReceipt } from "@/lib/types";

type Draft = { name: string; price: string };

const HOST_STEPS = ["Snap", "Check", "Share"];

const SAMPLE: ParsedReceipt = {
  merchant: "Sample receipt",
  items: [
    { name: "Chicken tacos", price: 14.5 },
    { name: "Carne asada burrito", price: 16 },
    { name: "Chips & guac", price: 9.25 },
    { name: "Horchata", price: 4.5 },
    { name: "Mango agua fresca", price: 4.75 },
  ],
  tax: 4.33,
  tip: 9.8,
};

/** Shrink phone photos before upload so they stay well under request size limits. */
async function toJpegBase64(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export default function Host() {
  const router = useRouter();
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [tax, setTax] = useState("0");
  const [tip, setTip] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hostName, setHostName] = useState("");
  const [hostWallet, setHostWallet] = useState("");
  const [splitMode, setSplitMode] = useState<"items" | "even">("items");
  const [people, setPeople] = useState(4);
  const [walletMode, setWalletMode] = useState<"demo" | "own">("demo");

  // Remember the host's name and wallet for their next bill.
  useEffect(() => {
    try {
      setHostName(localStorage.getItem("tabby:hostName") ?? "");
      const saved = localStorage.getItem("tabby:hostWallet") ?? "";
      setHostWallet(saved);
      if (saved) setWalletMode("own");
    } catch {}
  }, []);

  function chooseWalletMode(mode: "demo" | "own") {
    setWalletMode(mode);
    if (mode === "demo") setHostWallet("");
  }

  function load(r: ParsedReceipt) {
    setTitle(r.merchant || "Dinner");
    setItems(r.items.map((i) => ({ name: i.name, price: i.price.toFixed(2) })));
    setTax(r.tax.toFixed(2));
    setTip(r.tip.toFixed(2));
    setStage("review");
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setStage("reading");
    try {
      const image = await toJpegBase64(file);
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, mimeType: "image/jpeg" }),
      });
      const data = await readJson<any>(res);
      load(data);
    } catch (e) {
      setError((e as Error).message || "Couldn't read the receipt.");
      setStage("pick");
    }
  }

  const num = (s: string) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : 0);
  const itemsTotal = round2(items.reduce((s, i) => s + num(i.price), 0));
  const total = round2(itemsTotal + num(tax) + num(tip));

  async function start() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          tax: num(tax),
          tip: num(tip),
          items: items.filter((i) => i.name.trim()).map((i) => ({ name: i.name, price: num(i.price) })),
          hostName,
          hostWallet,
          evenSplit: splitMode === "even" ? people : null,
        }),
      });
      const data = await readJson<any>(res);
      try {
        // The host token unlocks the host's controls on this device only.
        localStorage.setItem(`tabby:host:${data.id}`, data.hostToken);
        localStorage.setItem("tabby:hostName", hostName.trim());
        localStorage.setItem("tabby:hostWallet", hostWallet.trim());
      } catch {}
      router.push(`/bill/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  /** Back to a blank home screen, discarding the current receipt. */
  function reset() {
    setStage("pick");
    setItems([]);
    setPreview(null);
    setError(null);
    setSaving(false);
  }

  const update = (i: number, patch: Partial<Draft>) =>
    setItems((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  if (stage === "review") {
    return (
      <main className="page">
        <Brand onHome={reset} />
        <p style={{ margin: "0 0 0.75rem" }}>
          <button className="link back-link" onClick={reset}>← Start over</button>
        </p>
        <Steps steps={HOST_STEPS} current={1} />
        <h1>Check the receipt</h1>
        <p className="lede">Tap any line to fix it. Make sure the total matches your paper receipt.</p>

        <div className="receipt-wrap">
          <div className="receipt">
            <input
              className="receipt-title"
              style={{ width: "100%", border: 0, background: "transparent" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Bill name"
            />
            <hr className="rule" />
            {items.map((d, i) => (
              <div className="edit-line" key={i}>
                <input value={d.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Item name" />
                <input
                  className="num"
                  inputMode="decimal"
                  value={d.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                  aria-label={`Price of ${d.name || "item"}`}
                />
                <button className="remove" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${d.name || "item"}`}>
                  ×
                </button>
              </div>
            ))}
            <p style={{ margin: "0.75rem 0 0" }}>
              <button className="btn ghost small" onClick={() => setItems((l) => [...l, { name: "", price: "" }])}>+ Add an item</button>
            </p>
            <hr className="rule" />
            <div className="edit-line">
              <span>Tax</span>
              <input className="num" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} aria-label="Tax" />
              <span />
            </div>
            <div className="edit-line">
              <span>Tip</span>
              <input className="num" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} aria-label="Tip" />
              <span />
            </div>
            <hr className="rule" />
            <div className="line total">
              <span>Total</span>
              <span className="price">{money(total)}</span>
            </div>
          </div>
        </div>

        <div className="host-card">
          <div className="field">
            <span className="field-label">How should everyone split it?</span>
            <div className="choice" role="radiogroup" aria-label="How to split the bill">
              <button
                type="button"
                role="radio"
                aria-checked={splitMode === "items"}
                className={`choice-opt${splitMode === "items" ? " on" : ""}`}
                onClick={() => setSplitMode("items")}
              >
                <strong>By what each person ordered</strong>
                <span>Friends tap their own food. Shared dishes split between whoever had them.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={splitMode === "even"}
                className={`choice-opt${splitMode === "even" ? " on" : ""}`}
                onClick={() => setSplitMode("even")}
              >
                <strong>Split evenly</strong>
                <span>Everyone pays the same share. No picking needed.</span>
              </button>
            </div>
            {splitMode === "even" && (
              <div className="stepper-row">
                <span>Number of people, including you</span>
                <div className="stepper">
                  <button type="button" aria-label="Fewer people" onClick={() => setPeople((n) => Math.max(2, n - 1))} disabled={people <= 2}>−</button>
                  <span aria-live="polite">{people}</span>
                  <button type="button" aria-label="More people" onClick={() => setPeople((n) => Math.min(50, n + 1))}>+</button>
                </div>
                <span className="hint">Each person pays {money(round2(total / people))}.</span>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="host">You paid the bill. What's your name?</label>
            <input id="host" autoComplete="given-name" placeholder="e.g. Sam" value={hostName} onChange={(e) => setHostName(e.target.value)} />
            <span className="hint">Friends will see "Pay {hostName.trim() || "you"} back".</span>
          </div>
          <div className="field">
            <label id="wallet-label">Where should friends pay you back?</label>
            <div className="row" role="radiogroup" aria-labelledby="wallet-label">
              <button
                type="button"
                className={`btn small${walletMode === "demo" ? "" : " ghost"}`}
                role="radio"
                aria-checked={walletMode === "demo"}
                onClick={() => chooseWalletMode("demo")}
              >
                Demo wallet
              </button>
              <button
                type="button"
                className={`btn small${walletMode === "own" ? "" : " ghost"}`}
                role="radio"
                aria-checked={walletMode === "own"}
                onClick={() => chooseWalletMode("own")}
              >
                My Solana wallet
              </button>
            </div>
            {walletMode === "own" && (
              <input
                id="wallet"
                className="mono"
                placeholder="Your Solana address"
                value={hostWallet}
                onChange={(e) => setHostWallet(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoFocus
                style={{ marginTop: "0.5rem" }}
              />
            )}
            <span className="hint">
              {walletMode === "demo"
                ? "Friends' repayments go to the team's shared demo wallet."
                : "Friends' repayments go straight to this address."}
            </span>
          </div>
        </div>

        <button
          className="btn block big"
          onClick={start}
          disabled={saving || items.length === 0 || !hostName.trim() || (walletMode === "own" && !hostWallet.trim())}
        >
          {saving ? "Creating your bill…" : hostName.trim() ? "Share with the table →" : "Add your name to continue"}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <Brand />
      <Steps steps={HOST_STEPS} current={0} />
      <h1>Snap the receipt. Everyone pays their part.</h1>
      <p className="lede">You paid the bill? Friends tap what they ordered and pay you back in seconds. No math, no chasing.</p>

      {stage === "reading" ? (
        <div className="drop" aria-live="polite">
          {preview && <img className="preview" src={preview} alt="Your receipt" />}
          <span className="spinner" aria-hidden="true" />
          <strong>Reading your receipt…</strong>
          <span className="muted">This takes a few seconds.</span>
        </div>
      ) : (
        <label className="drop">
          <span className="drop-icon" aria-hidden="true">📷</span>
          <strong>Take a photo of the receipt</strong>
          <span className="muted">or choose one from your photos</span>
          <span className="btn small" aria-hidden="true">Choose photo</span>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="error">{error}</p>}

      <div className="spacer" />
      <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.9rem" }}>No receipt handy?</p>
      <div className="row">
        <button className="btn ghost" onClick={() => load({ merchant: "Dinner", items: [{ name: "", price: 0 }], tax: 0, tip: 0 })}>
          Type it in
        </button>
        <button className="btn ghost" onClick={() => load(SAMPLE)}>Try a sample receipt</button>
      </div>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li><strong>Snap the receipt.</strong> Tabby reads every item, plus tax and tip.</li>
          <li><strong>Friends scan your screen.</strong> They tap what they ate. No app needed.</li>
          <li><strong>Everyone pays you back.</strong> One tap each, and you watch it land.</li>
        </ol>
      </section>
    </main>
  );
}

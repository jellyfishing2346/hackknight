"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, round2 } from "@/lib/split";
import type { ParsedReceipt } from "@/lib/types";

type Draft = { name: string; price: string };

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/bill/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const update = (i: number, patch: Partial<Draft>) =>
    setItems((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  if (stage === "review") {
    return (
      <main className="page">
        <p className="brand">Tabby</p>
        <h1>Check the receipt</h1>
        <p className="lede">Fix anything that was misread, then share the bill with the table.</p>

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
              <button className="link" onClick={() => setItems((l) => [...l, { name: "", price: "" }])}>Add item</button>
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

        <div className="spacer" />
        <button className="btn block" onClick={start} disabled={saving || items.length === 0}>
          {saving ? "Creating bill…" : "Share with the table"}
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <p className="brand">Tabby</p>
      <h1>Snap the receipt. Everyone pays their part.</h1>
      <p className="lede">Friends tap what they ordered and settle their share in about a second, no chasing anyone later.</p>

      {stage === "reading" ? (
        <div className="drop" aria-live="polite">
          {preview && <img className="preview" src={preview} alt="Your receipt" />}
          <strong>Reading the receipt…</strong>
        </div>
      ) : (
        <label className="drop">
          <strong>Take a photo of the receipt</strong>
          <span className="muted">or choose one from your photos</span>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="error">{error}</p>}

      <div className="spacer" />
      <div className="row">
        <button className="btn ghost" onClick={() => load({ merchant: "Dinner", items: [{ name: "", price: 0 }], tax: 0, tip: 0 })}>
          Type it in instead
        </button>
        <button className="link" onClick={() => load(SAMPLE)}>Use a sample receipt</button>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { money, people, shareFor } from "@/lib/split";

/** What each friend sees on their phone after scanning the table QR. */
export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const { state, error, refresh } = useBill(id, 2000);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(`tabby:${id}:name`);
    if (saved) setName(saved);
  }, [id]);

  function join() {
    const n = nameInput.trim();
    if (!n) return;
    sessionStorage.setItem(`tabby:${id}:name`, n);
    setName(n);
  }

  async function toggle(itemId: string, claim: boolean) {
    setBusy(itemId);
    setActionError(null);
    setPayUrl(null);
    const res = await fetch(`/api/items/${itemId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, claim }),
    });
    if (!res.ok) setActionError((await res.json()).error);
    await refresh();
    setBusy(null);
  }

  async function pay() {
    setBusy("pay");
    setActionError(null);
    const res = await fetch(`/api/bills/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) setActionError(data.error);
    else setPayUrl(data.url);
    setBusy(null);
  }

  if (!state) return <main className="page"><p className={error ? "error" : "muted"}>{error ?? "Loading bill…"}</p></main>;
  const { bill, items, payments } = state;

  if (!name) {
    return (
      <main className="page">
        <p className="brand">Tabby</p>
        <h1>{bill.title}</h1>
        <p className="lede">Add your name so the table knows who ordered what.</p>
        <form onSubmit={(e) => { e.preventDefault(); join(); }}>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" autoFocus autoComplete="given-name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
          </div>
          <div className="spacer" />
          <button className="btn block" disabled={!nameInput.trim()}>Join the bill</button>
        </form>
      </main>
    );
  }

  const share = shareFor(name, items, bill);
  const me = people(bill, items, payments).find((p) => p.name === name);
  const settled = me?.settled ?? false;
  const left = me ? Math.max(0, me.owed - me.paid) : share.total;

  if (settled) {
    return (
      <main className="page">
        <p className="brand">Tabby</p>
        <div className="done" aria-live="polite">
          <span className="stamp big fresh">Paid</span>
          <p><strong>{money(me!.paid)}</strong> sent for {bill.title}. You're all square, {name}.</p>
          <p className="muted">Ordered something else? Tap it below and you can pay the difference.</p>
        </div>
        {renderItems()}
      </main>
    );
  }

  function renderItems() {
    return (
      <div className="receipt-wrap">
        <div className="receipt">
          <p className="receipt-title">{bill.title}</p>
          <p className="receipt-sub">Tap everything you ordered</p>
          <hr className="rule" />
          {items.map((i) => {
            const mine = i.claimed_by === name;
            const taken = !!i.claimed_by && !mine;
            return (
              <button
                key={i.id}
                className={`claim-line line${mine ? " mine" : ""}${taken ? " taken" : ""}`}
                disabled={taken || busy === i.id}
                aria-pressed={mine}
                onClick={() => toggle(i.id, !mine)}
              >
                <span className="name">
                  {i.name}
                  {taken && <span className="who">{i.claimed_by}</span>}
                </span>
                <span className="price">{money(i.price)}</span>
              </button>
            );
          })}
          <hr className="rule" />
          <div className="line"><span>Your items</span><span className="price">{money(share.subtotal)}</span></div>
          <div className="line"><span>Your share of tax &amp; tip</span><span className="price">{money(share.extras)}</span></div>
        </div>
      </div>
    );
  }

  return (
    <main className="page">
      <p className="brand">Tabby</p>
      <h1 style={{ fontSize: "2rem" }}>Hi {name}, what did you order?</h1>
      <p className="lede" style={{ marginBottom: "1.5rem" }}>
        Not you? <button className="link" onClick={() => { sessionStorage.removeItem(`tabby:${id}:name`); setName(""); }}>Change name</button>
      </p>
      {renderItems()}
      {actionError && <p className="error">{actionError}</p>}

      {payUrl && (
        <div className="panel" aria-live="polite">
          <h2>Pay {money(left)}</h2>
          <a className="btn block" href={payUrl}>Open in wallet</a>
          <p className="muted" style={{ fontSize: "0.9rem" }}>Paying from another device? Scan this with Phantom.</p>
          <QR value={payUrl} alt="Solana Pay QR code for your share" />
          <p className="muted" style={{ fontSize: "0.9rem", margin: 0 }}>This page updates the moment your payment lands.</p>
        </div>
      )}

      <div className="paybar">
        <span>
          <span className="small">Your share</span>
          <span className="amt">{money(left)}</span>
        </span>
        <button className="btn" onClick={pay} disabled={left <= 0 || busy === "pay"}>
          {busy === "pay" ? "Preparing…" : payUrl ? "Refresh payment" : "Pay my share"}
        </button>
      </div>
    </main>
  );
}

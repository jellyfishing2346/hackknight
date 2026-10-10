"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Transaction } from "@solana/web3.js";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { amountLeft, explorerTx, latestSignature, money, sameName, split } from "@/lib/split";

type PhantomProvider = {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

function getPhantom(): PhantomProvider | null {
  const w = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));

/** What each friend sees on their phone after scanning the table QR. */
export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const { state, error, refresh } = useBill(id, 2000);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [hasPhantom, setHasPhantom] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`tabby:${id}:name`);
      if (saved) setName(saved);
    } catch {}
  }, [id]);

  // Wallet extensions inject themselves shortly after load, so check again after a moment.
  useEffect(() => {
    setHasPhantom(!!getPhantom());
    const t = setTimeout(() => setHasPhantom(!!getPhantom()), 800);
    return () => clearTimeout(t);
  }, []);

  function chooseName(n: string) {
    try {
      sessionStorage.setItem(`tabby:${id}:name`, n);
    } catch {}
    setName(n);
    setConfirmName(null);
    setActionError(null);
  }

  function join() {
    const n = nameInput.trim();
    if (!n || !state) return;
    if (sameName(n, state.bill.host_name)) {
      setActionError(`${state.bill.host_name} is the host who paid. Use your own name.`);
      return;
    }
    // Someone with this name already joined. Same person on another phone, or a different person?
    const taken = split(state.bill, state.items, state.payments).guests.find((g) => sameName(g.name, n));
    if (taken) {
      setConfirmName(taken.name);
      return;
    }
    chooseName(n);
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

  /** One tap, no wallet: the server sends a real devnet payment to the host. */
  async function payNow() {
    setBusy("instant");
    setActionError(null);
    try {
      const res = await fetch(`/api/bills/${id}/instant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message || "Payment failed.");
    } finally {
      setBusy(null);
    }
  }

  /** Show the Solana Pay link and QR for paying from your own wallet. */
  async function payFromWallet() {
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

  /**
   * Pay through the Phantom extension or Phantom's in-app browser. Our server builds the
   * transaction, Phantom only signs it, and our server sends it to devnet.
   */
  async function payWithPhantom() {
    const provider = getPhantom();
    if (!provider) {
      setActionError("Phantom isn't available here. On a phone, open this page in the Phantom app's browser.");
      return;
    }
    setBusy("phantom");
    setActionError(null);
    try {
      const { publicKey } = await provider.connect();
      const res = await fetch(`/api/bills/${id}/tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, account: publicKey.toString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const signed = await provider.signTransaction(Transaction.from(fromBase64(data.transaction)));
      const sent = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: toBase64(new Uint8Array(signed.serialize())) }),
      });
      const result = await sent.json();
      if (!sent.ok) throw new Error(result.error);
      await refresh();
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setActionError(err.code === 4001 ? "Payment cancelled in Phantom." : err.message || "Payment failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!state) return <main className="page"><p className={error ? "error" : "muted"}>{error ?? "Loading bill…"}</p></main>;
  const { bill, items, payments } = state;
  const host = bill.host_name;
  const s = split(bill, items, payments);

  if (!name) {
    return (
      <main className="page">
        <p className="brand">Tabby</p>
        <h1>{bill.title}</h1>
        <p className="lede">{host} covered the bill. Add your name, tap what you ordered, and pay {host} back.</p>
        {confirmName ? (
          <div className="panel" style={{ textAlign: "left" }}>
            <h2>{confirmName} already joined.</h2>
            <p className="muted">Is that you on another phone?</p>
            <div className="row">
              <button className="btn" onClick={() => chooseName(confirmName)}>Yes, that's me</button>
              <button className="btn ghost" onClick={() => { setConfirmName(null); setNameInput(""); }}>No, I'm someone else</button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); join(); }}>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" autoFocus autoComplete="given-name" value={nameInput} onChange={(e) => { setNameInput(e.target.value); setActionError(null); }} />
            </div>
            {actionError && <p className="error">{actionError}</p>}
            <div className="spacer" />
            <button className="btn block" disabled={!nameInput.trim()}>Join the bill</button>
          </form>
        )}
      </main>
    );
  }

  const me = s.guests.find((g) => sameName(g.name, name));
  const left = amountLeft(s, name);
  const settled = !!me && me.owed > 0 && me.settled;
  const sig = latestSignature(name, payments);

  function renderItems() {
    return (
      <div className="receipt-wrap">
        <div className="receipt">
          <p className="receipt-title">{bill.title}</p>
          <p className="receipt-sub">Tap everything you ordered</p>
          <hr className="rule" />
          {items.map((i) => {
            const mine = sameName(i.claimed_by, name);
            const taken = !!i.claimed_by && !mine;
            const who = taken ? (sameName(i.claimed_by, host) ? `${host} (host)` : i.claimed_by) : null;
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
                  {who && <span className="who">{who}</span>}
                </span>
                <span className="price">{money(i.price)}</span>
              </button>
            );
          })}
          <hr className="rule" />
          <div className="line"><span>Your items</span><span className="price">{money(me?.items ?? 0)}</span></div>
          {(me?.leftover ?? 0) > 0 && (
            <div className="line"><span>Your share of leftovers</span><span className="price">{money(me!.leftover)}</span></div>
          )}
          <div className="line"><span>Your share of tax &amp; tip</span><span className="price">{money(me?.extras ?? 0)}</span></div>
        </div>
      </div>
    );
  }

  if (settled && left <= 0) {
    return (
      <main className="page">
        <p className="brand">Tabby</p>
        <div className="done" aria-live="polite">
          <span className="stamp big fresh">Paid</span>
          <p>You paid {host} back <strong>{money(me!.paid)}</strong> for {bill.title}. You're all square, {name}.</p>
          {sig && (
            <p>
              <a className="chain-link inline" href={explorerTx(sig)} target="_blank" rel="noreferrer">
                See your payment on the Solana Explorer ↗
              </a>
            </p>
          )}
          <p className="muted">Forgot something? Tap it below and pay the difference.</p>
        </div>
        {renderItems()}
        {actionError && <p className="error">{actionError}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <p className="brand">Tabby</p>
      <h1 style={{ fontSize: "2rem" }}>Hi {name}, what did you order?</h1>
      <p className="lede" style={{ marginBottom: "1.5rem" }}>
        {host} covered the bill. Tap your items and pay {host} back.{" "}
        <button className="link" onClick={() => { try { sessionStorage.removeItem(`tabby:${id}:name`); } catch {} setName(""); setNameInput(""); }}>
          Not {name}?
        </button>
      </p>
      {renderItems()}
      {actionError && <p className="error">{actionError}</p>}
      {s.splitLeftovers && (
        <p className="muted" style={{ fontSize: "0.9rem", marginTop: "1rem" }}>
          {host} is splitting unclaimed items evenly, so your share includes part of them.
        </p>
      )}

      {!payUrl && left > 0 && (
        <p style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button className="link" onClick={payFromWallet} disabled={busy === "pay"}>Pay from my own wallet instead</button>
        </p>
      )}

      {payUrl && (
        <div className="panel" aria-live="polite">
          <h2>Pay {host} back {money(left)}</h2>
          {hasPhantom ? (
            <button className="btn block" onClick={payWithPhantom} disabled={busy === "phantom"}>
              {busy === "phantom" ? "Waiting for Phantom…" : "Pay with Phantom"}
            </button>
          ) : (
            <a className="btn block" href={payUrl}>Open in wallet</a>
          )}
          <p className="muted" style={{ fontSize: "0.9rem" }}>Paying from another device? Scan this with a Solana Pay wallet.</p>
          <QR value={payUrl} alt="Solana Pay QR code for your share" />
          <p className="muted" style={{ fontSize: "0.9rem", margin: 0 }}>This page updates the moment your payment lands.</p>
        </div>
      )}

      <div className="paybar">
        <span>
          <span className="small">You owe {host}</span>
          <span className="amt">{money(left)}</span>
        </span>
        <button className="btn" onClick={payNow} disabled={left <= 0 || busy === "instant"}>
          {busy === "instant" ? "Paying…" : left > 0 ? `Pay ${host} back` : "Tap your items"}
        </button>
      </div>
    </main>
  );
}

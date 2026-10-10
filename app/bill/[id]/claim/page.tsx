"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { Transaction } from "@solana/web3.js";
import { money, people, shareFor } from "@/lib/split";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [hasPhantom, setHasPhantom] = useState(false);

  // Wallet extensions inject themselves shortly after load, so check again after a moment.
  useEffect(() => {
    setHasPhantom(!!getPhantom());
    const t = setTimeout(() => setHasPhantom(!!getPhantom()), 800);
    return () => clearTimeout(t);
  }, []);

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

  /**
   * Pay through the Phantom extension or Phantom's in-app browser. Our server builds the
   * transaction, Phantom only signs it, and our server sends it to devnet, so this works
   * whichever network Phantom is set to.
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

  /** One tap, no wallet: the server sends a real devnet payment for this share. */
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

      {!payUrl && left > 0 && (
        <p style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button className="link" onClick={pay} disabled={busy === "pay"}>Pay with my own wallet instead</button>
        </p>
      )}

      {payUrl && (
        <div className="panel" aria-live="polite">
          <h2>Pay {money(left)}</h2>
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
          <span className="small">Your share</span>
          <span className="amt">{money(left)}</span>
        </span>
        <button className="btn" onClick={payNow} disabled={left <= 0 || busy === "instant"}>
          {busy === "instant" ? "Paying…" : `Pay ${money(left)}`}
        </button>
      </div>
    </main>
  );
}

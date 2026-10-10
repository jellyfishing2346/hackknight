"use client";
import Link from "next/link";
import { Brand } from "@/app/components/Brand";
import { Steps } from "@/app/components/Steps";

const GUEST_STEPS = ["Your name", "Your share", "Pay back"];
const EVEN_STEPS = ["Your name", "Pay back"];

type ShareAsk = { itemId: string; itemName: string; price: number; others: string[] };
import { readJson } from "@/app/components/api";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Transaction } from "@solana/web3.js";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { amountLeft, explorerTx, hasClaimed, latestSignature, money, sameName, split } from "@/lib/split";
import { readProfile, saveProfile } from "@/app/components/profile";

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

/** What each friend sees on their phone after scanning the shared QR. */
export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const { state, error, refresh } = useBill(id, 2000);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shareAsk, setShareAsk] = useState<ShareAsk | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [hasPhantom, setHasPhantom] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`tabby:${id}:name`);
      if (saved) setName(saved);
      else setNameInput(readProfile().username);
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
    saveProfile({ username: n });
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
    try {
      await readJson(res);
    } catch (e) {
      setActionError((e as Error).message);
    }
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
      const data = await readJson<any>(res);
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
    try {
      const data = await readJson<{ url: string }>(res);
      setPayUrl(data.url);
    } catch (e) {
      setActionError((e as Error).message);
    }
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
      const data = await readJson<any>(res);
      const signed = await provider.signTransaction(Transaction.from(fromBase64(data.transaction)));
      const sent = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: toBase64(new Uint8Array(signed.serialize())) }),
      });
      const result = await readJson<any>(sent);
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
        <Brand />
        <Steps steps={s.evenSplit ? EVEN_STEPS : GUEST_STEPS} current={0} />
        <h1>{bill.title}</h1>
        <p className="lede">
          {s.evenSplit
            ? `${host} paid for everyone, and the bill is split evenly ${s.evenSplit} ways. Tell us your name and pay ${host} back your share.`
            : `${host} paid for everyone. Tell us your name, tap what's yours, and pay ${host} back. It takes about 30 seconds.`}
        </p>
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
            <button className="btn block big" disabled={!nameInput.trim()}>{s.evenSplit ? "Next: see your share →" : "Next: pick your share →"}</button>
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
    if (s.evenSplit) {
      return (
        <div className="receipt-wrap">
          <div className="receipt">
            <p className="receipt-title">{bill.title}</p>
            <p className="receipt-sub">Split evenly {s.evenSplit} ways</p>
            <hr className="rule" />
            {items.map((i) => (
              <div className="line" key={i.id}>
                <span className="name">{i.name}</span>
                <span className="price">{money(i.price)}</span>
              </div>
            ))}
            <hr className="rule" />
            <div className="line"><span>Total, with tax &amp; tip</span><span className="price">{money(s.total)}</span></div>
            <div className="line total"><span>Your share (1 of {s.evenSplit})</span><span className="price">{money(s.evenShare ?? 0)}</span></div>
          </div>
        </div>
      );
    }
    return (
      <div className="receipt-wrap">
        <div className="receipt">
          <p className="receipt-title">{bill.title}</p>
          <p className="receipt-sub">Tap everything that's yours or shared</p>
          <hr className="rule" />
          {items.map((i) => {
            const mine = hasClaimed(i, name);
            const others = i.claimers
              .filter((c) => !sameName(c, name))
              .map((c) => (sameName(c, host) ? `${host} (host)` : c));
            const count = i.claimers.length;
            const who =
              mine && count > 1
                ? `Shared with ${others.join(", ")} · ${money(i.price / count)} each`
                : !mine && others.length
                  ? `${others.join(", ")} · tap if you shared it`
                  : null;
            return (
              <button
                key={i.id}
                className={`claim-line line${mine ? " mine" : ""}${!mine && others.length ? " others" : ""}`}
                disabled={busy === i.id}
                aria-pressed={mine}
                onClick={() => {
                  if (mine) toggle(i.id, false);
                  else if (others.length) setShareAsk({ itemId: i.id, itemName: i.name, price: i.price, others });
                  else toggle(i.id, true);
                }}
              >
                <span className="name">
                  {i.name}
                  {who && <span className="who">{who}</span>}
                </span>
                <span className="price">{mine && count > 1 ? money(i.price / count) : money(i.price)}</span>
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

  /** "Did you share it?" so nobody joins someone else's item by accident. */
  function renderShareAsk() {
    if (!shareAsk) return null;
    const ways = shareAsk.others.length + 1;
    return (
      <div className="sheet-backdrop" onClick={() => setShareAsk(null)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
          <h2 id="share-title">Did you share the {shareAsk.itemName} with {shareAsk.others.join(" and ")}?</h2>
          <p className="muted">It'll be split {ways} ways, so each person pays {money(shareAsk.price / ways)}.</p>
          <button
            className="btn block big"
            onClick={() => {
              toggle(shareAsk.itemId, true);
              setShareAsk(null);
            }}
          >
            Yes, we shared it
          </button>
          <button className="btn ghost block" style={{ marginTop: "0.6rem" }} onClick={() => setShareAsk(null)}>
            No, that's not mine
          </button>
        </div>
      </div>
    );
  }

  if (settled && left <= 0) {
    return (
      <main className="page">
        <Brand />
        <div className="done" aria-live="polite">
          <span className="stamp big fresh">Paid</span>
          <p>You paid {host} back <strong>{money(me!.paid)}</strong> for {bill.title}. You're all square, {name}.</p>
          {sig && (
            <p>
              <a className="chain-link inline" href={explorerTx(sig)} target="_blank" rel="noreferrer">
                See proof of payment ↗
              </a>
            </p>
          )}
          {!s.evenSplit && <p className="muted">Forgot something? Tap it below and pay the difference.</p>}
          <p>
            <Link href="/" className="link">Split your own bill with Tabby →</Link>
          </p>
        </div>
        {renderItems()}
        {actionError && <p className="error">{actionError}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <Brand />
      {s.evenSplit ? (
        <Steps steps={EVEN_STEPS} current={1} />
      ) : (
        <Steps steps={GUEST_STEPS} current={(me?.items ?? 0) > 0 || (me?.leftover ?? 0) > 0 ? 2 : 1} />
      )}
      <h1 style={{ fontSize: "2rem" }}>{s.evenSplit ? `Hi ${name}!` : `Hi ${name}, what's yours?`}</h1>
      <p className="lede" style={{ marginBottom: "1.5rem" }}>
        {s.evenSplit ? `${host} covered the bill for everyone.` : `${host} covered the bill. Tap your items and pay ${host} back.`}{" "}
        <button className="link" onClick={() => { try { sessionStorage.removeItem(`tabby:${id}:name`); } catch {} setName(""); setNameInput(""); }}>
          Not {name}?
        </button>
      </p>
      {s.evenSplit ? (
        <p className="callout">
          {host} split the bill evenly {s.evenSplit} ways. Your share is <strong>{money(s.evenShare ?? 0)}</strong>. Tap <strong>Pay {host} back</strong> below.
        </p>
      ) : (
        (me?.items ?? 0) === 0 && (
          <p className="callout">👆 Tap the items that are yours. Sharing something? Tap it too and the cost splits automatically.</p>
        )
      )}
      {renderShareAsk()}
      {renderItems()}
      {actionError && <p className="error">{actionError}</p>}
      {s.splitLeftovers && (
        <p className="muted" style={{ fontSize: "0.9rem", marginTop: "1rem" }}>
          {host} is splitting unclaimed items evenly, so your share includes part of them.
        </p>
      )}

      {!payUrl && left > 0 && (
        <p style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button className="link quiet" onClick={payFromWallet} disabled={busy === "pay"}>Have a crypto wallet? Pay from it instead</button>
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
          {busy === "instant" ? "Sending…" : left > 0 ? `Pay ${host} back` : s.evenSplit ? "All paid" : "Tap your items first"}
        </button>
      </div>
    </main>
  );
}

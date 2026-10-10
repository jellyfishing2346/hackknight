"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { explorerTx, latestSignature, money, sameName, split } from "@/lib/split";

/** The laptop screen in the middle of the table. The host's device also gets host controls. */
export default function LiveBill() {
  const { id } = useParams<{ id: string }>();
  const { state, error, refresh } = useBill(id);
  const [joinUrl, setJoinUrl] = useState("");
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const seenPaid = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const wasSettled = useRef<boolean | null>(null);
  const [settledFresh, setSettledFresh] = useState(false);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/bill/${id}/claim`);
    try {
      setHostToken(localStorage.getItem(`tabby:host:${id}`));
    } catch {}
  }, [id]);

  const s = state ? split(state.bill, state.items, state.payments) : null;

  // Stamp animations only for changes that happen live, not on first load.
  useEffect(() => {
    if (!s) return;
    const paidNow = new Set(s.guests.filter((g) => g.settled && g.owed > 0).map((g) => g.name));
    if (seenPaid.current) {
      const newly = [...paidNow].filter((n) => !seenPaid.current!.has(n));
      if (newly.length) setFresh(new Set(newly));
    }
    seenPaid.current = paidNow;
    if (wasSettled.current === false && s.settled) setSettledFresh(true);
    wasSettled.current = s.settled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function hostAction(action: string, itemId?: string) {
    setBusy(itemId ?? action);
    setActionError(null);
    try {
      const res = await fetch(`/api/bills/${id}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: hostToken, action, itemId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!state || !s) return <main className="page"><p className={error ? "error" : "muted"}>{error ?? "Loading bill…"}</p></main>;

  const { bill, items, payments } = state;
  const host = bill.host_name;
  const isHostDevice = !!hostToken;
  const pct = s.owedToHost > 0 ? Math.min(100, (s.collected / s.owedToHost) * 100) : 0;

  return (
    <main className="page wide">
      <p className="brand">Tabby</p>
      <div className="live">
        <div>
          <div className="receipt-wrap">
            <div className="receipt">
              <p className="receipt-title">{bill.title}</p>
              <p className="receipt-sub">
                Paid by {host} · {new Date(bill.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <hr className="rule" />
              {items.map((i) => {
                const mine = sameName(i.claimed_by, host);
                const who = i.claimed_by
                  ? mine ? `${host} (host)` : i.claimed_by
                  : s.splitLeftovers ? "Split evenly" : "Unclaimed";
                const canToggle = isHostDevice && (!i.claimed_by || mine);
                const content = (
                  <>
                    <span className="name">
                      {i.name}
                      <span className="who">{who}</span>
                    </span>
                    <span className="price">{money(i.price)}</span>
                  </>
                );
                return canToggle ? (
                  <button
                    key={i.id}
                    className={`claim-line line${mine ? " mine" : ""}`}
                    aria-pressed={mine}
                    disabled={busy === i.id}
                    onClick={() => hostAction(mine ? "release-item" : "claim-item", i.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="line" key={i.id}>{content}</div>
                );
              })}
              <hr className="rule" />
              <div className="line"><span>Tax</span><span className="price">{money(bill.tax)}</span></div>
              <div className="line"><span>Tip</span><span className="price">{money(bill.tip)}</span></div>
              <hr className="rule" />
              <div className="line total"><span>Total</span><span className="price">{money(s.total)}</span></div>
            </div>
          </div>
          {isHostDevice && !s.settled && (
            <p className="muted host-hint">You're the host. Tap the items you had yourself, they're already covered.</p>
          )}
        </div>

        <section>
          {s.settled ? (
            <div className="settled" aria-live="polite">
              <span className={`stamp big${settledFresh ? " fresh" : ""}`}>Settled</span>
              <div>
                <h2>{host} is paid back.</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {money(s.collected)} from {s.guests.length} {s.guests.length === 1 ? "friend" : "friends"}, settled on Solana. Nobody has to chase anyone.
                </p>
              </div>
            </div>
          ) : (
            <div className="join">
              {joinUrl && <QR value={joinUrl} alt="QR code to join this bill" />}
              <div>
                <h2>Scan to pay {host} back</h2>
                <p className="muted" style={{ margin: 0 }}>Tap what you ordered and pay your share in a second.</p>
              </div>
            </div>
          )}

          <h2 style={{ marginBottom: "0.2rem" }}>{host} fronted {money(s.total)}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {money(s.collected)} paid back{s.toGo > 0 ? ` · ${money(s.toGo)} to go` : ""}
          </p>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>

          {s.unclaimedCount > 0 && !s.splitLeftovers && (
            <div className="leftovers">
              <p style={{ margin: 0 }}>
                <strong>{s.unclaimedCount} unclaimed {s.unclaimedCount === 1 ? "item" : "items"}</strong> ({money(s.unclaimedTotal)})
              </p>
              {isHostDevice ? (
                <div className="row">
                  <button className="btn ghost small" onClick={() => hostAction("split-rest")} disabled={!!busy}>Split evenly</button>
                  <button className="btn ghost small" onClick={() => hostAction("cover-rest")} disabled={!!busy}>{s.unclaimedCount === 1 ? "I'll cover it" : "I'll cover them"}</button>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>Claim them, or {host} can split or cover them.</p>
              )}
            </div>
          )}
          {s.splitLeftovers && (
            <div className="leftovers">
              <p style={{ margin: 0 }}>
                {money(s.unclaimedTotal)} of unclaimed items is split evenly between everyone.
              </p>
              {isHostDevice && (
                <button className="link" onClick={() => hostAction("unsplit")} disabled={!!busy}>Undo</button>
              )}
            </div>
          )}
          {actionError && <p className="error">{actionError}</p>}

          <div aria-live="polite">
            <div className="person">
              <span>
                <span className="person-name">{host}</span>
                <span className="chain-link">Paid the restaurant</span>
              </span>
              <span className="row">
                <span className="person-amt">{money(s.hostShare)}</span>
                <span className="stamp muted-stamp">Covered</span>
              </span>
            </div>
            {s.guests.length === 0 && <p className="muted">Nobody has joined yet.</p>}
            {s.guests.map((g) => {
              const sig = g.settled && g.owed > 0 ? latestSignature(g.name, payments) : null;
              return (
                <div className="person" key={g.name}>
                  <span>
                    <span className="person-name">{g.name}</span>
                    {sig && (
                      <a className="chain-link" href={explorerTx(sig)} target="_blank" rel="noreferrer">
                        View transaction ↗
                      </a>
                    )}
                  </span>
                  <span className="row">
                    <span className="person-amt">{money(g.owed)}</span>
                    {g.settled && g.owed > 0 ? (
                      <span className={`stamp${fresh.has(g.name) ? " fresh" : ""}`}>Paid</span>
                    ) : (
                      <span className="muted" style={{ fontSize: "0.9rem" }}>{g.paid > 0 ? `${money(g.owed - g.paid)} left` : "Not paid"}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

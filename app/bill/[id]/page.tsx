"use client";
import Link from "next/link";
import { Brand } from "@/app/components/Brand";
import { Steps } from "@/app/components/Steps";
import { readJson } from "@/app/components/api";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { explorerTx, hasClaimed, latestSignature, money, round2, sameName, split } from "@/lib/split";
import "@/app/components/features.css";

/** The host's shared live screen. The host's device also gets host controls. */
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
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const speechQueue = useRef<Promise<void>>(Promise.resolve());
  // Browsers only allow sound after someone has tapped the page once.
  const [audioAllowed, setAudioAllowed] = useState(true);
  const blocked = useRef<{ kind: "paid" | "settled" | "test"; name?: string }[]>([]);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  /** Turn read-aloud on or off, and remember the choice on this device. On unless switched off. */
  function setSound(on: boolean) {
    setSoundOn(on);
    try {
      localStorage.setItem("tabby:sound", on ? "on" : "off");
    } catch {}
  }

  useEffect(() => {
    let pref: string | null = null;
    try {
      pref = localStorage.getItem("tabby:sound");
    } catch {}
    setSoundOn(pref !== "off");
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) setAudioAllowed(false);
    const unlock = () => {
      setAudioAllowed(true);
      // Play anything that arrived while sound was blocked.
      const pending = blocked.current.splice(0);
      pending.forEach((p) => announce(p.kind, p.name));
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fetch an announcement from the server and play it after any that are already playing. */
  function announce(kind: "paid" | "settled" | "test", name?: string) {
    speechQueue.current = speechQueue.current.then(async () => {
      try {
        const res = await fetch("/api/announce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billId: id, kind, name }),
        });
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error;
          if (kind === "test") throw new Error(msg || "Couldn't turn on announcements.");
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        try {
          await audio.play();
        } catch (err) {
          if ((err as Error).name === "NotAllowedError") {
            // Blocked until someone taps the page: keep it and play it after that tap.
            blocked.current.push({ kind, name });
            setAudioAllowed(false);
            URL.revokeObjectURL(url);
            return;
          }
          throw err;
        }
        await new Promise<void>((done) => {
          audio.onended = () => done();
          audio.onerror = () => done();
        });
        URL.revokeObjectURL(url);
      } catch (e) {
        if (kind === "test") {
          setSoundOn(false);
          setSoundError((e as Error).message);
        }
      }
    });
  }

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
      if (soundOn) newly.forEach((n) => announce("paid", n));
    }
    seenPaid.current = paidNow;
    if (wasSettled.current === false && s.settled) {
      setSettledFresh(true);
      if (soundOn) announce("settled");
    }
    wasSettled.current = s.settled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function hostAction(action: string, itemId?: string, count?: number | null) {
    setBusy(itemId ?? action);
    setActionError(null);
    try {
      const res = await fetch(`/api/bills/${id}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: hostToken, action, itemId, count }),
      });
      await readJson(res);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!state || !s) return <main className="page"><p className={error ? "error" : "muted"}>{error ?? "Loading bill…"}</p></main>;

  const { bill, items, payments } = state;

  /** Share or copy a message, using the phone's share menu when there is one. Returns what happened. */
  async function shareText(title: string, text: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title, text, url });
        return "shared";
      } catch (e) {
        if ((e as Error).name === "AbortError") return "cancelled";
      }
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  }

  /** "Send to group chat": for friends who aren't at the table. */
  async function shareBill() {
    const each = s!.evenSplit ? ` It's split evenly, ${money(s!.evenShare ?? 0)} each.` : "";
    const text = `${host} covered "${bill.title}" (${money(s!.total)}).${each} Tap to see your share and pay ${host} back:`;
    try {
      const how = await shareText(`${bill.title} on Tabby`, text, joinUrl);
      if (how === "copied") setShareNote("Link copied. Paste it in your group chat.");
      else if (how === "shared") setShareNote("Sent!");
    } catch {
      setShareNote("Couldn't share. Copy this page's QR link instead.");
    }
    setTimeout(() => setShareNote(null), 4000);
  }

  /** A friendly nudge with the exact amount and the link to pay. */
  async function remind(guest: string, amount: number) {
    const text = `Hi ${guest}! Friendly reminder from ${host}: your share of "${bill.title}" is ${money(amount)}. You can pay it back in one tap here:`;
    try {
      const how = await shareText(`Your share of ${bill.title}`, text, joinUrl);
      if (how !== "cancelled") setReminded((prev) => new Set(prev).add(guest));
      if (how === "copied") {
        setShareNote(`Reminder for ${guest} copied. Paste it in a message.`);
        setTimeout(() => setShareNote(null), 4000);
      }
    } catch {
      setShareNote("Couldn't copy the reminder.");
    }
  }
  const host = bill.host_name;
  const isHostDevice = !!hostToken;
  // Host controls lock once settled, and anything that changes guests' shares locks once someone pays.
  const anyPaid = payments.some((p) => p.status === "paid");
  const hostCanEdit = isHostDevice && !s.settled;
  const sharesLocked = anyPaid;
  // Progress counts unclaimed items as still outstanding, so the bar can't hit 100% early.
  const outstanding = s.owedToHost + s.unassigned;
  const pct = outstanding > 0 ? Math.min(100, (s.collected / outstanding) * 100) : 0;

  return (
    <main className="page wide">
      <Brand />
      {isHostDevice && !s.settled && <Steps steps={["Snap", "Check", "Share"]} current={2} />}
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
                const mine = hasClaimed(i, host);
                const names = i.claimers.map((c) => (sameName(c, host) ? `${host} (host)` : c));
                const who = s.evenSplit
                  ? "Split evenly"
                  : i.claimers.length === 0
                    ? s.splitLeftovers ? "Split evenly" : "Unclaimed"
                    : i.claimers.length > 1
                      ? `${names.join(" + ")} · split ${i.claimers.length} ways`
                      : names[0];
                // The host can join any item they had, unless that would change a share someone already paid.
                const paidSharer = i.claimers.some(
                  (c) => !sameName(c, host) && payments.some((p) => sameName(p.payer_name, c) && p.status === "paid"),
                );
                const canToggle = hostCanEdit && !s.evenSplit && !(sharesLocked && s.splitLeftovers) && !paidSharer;
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
          {hostCanEdit && !s.evenSplit && !(sharesLocked && s.splitLeftovers) && (
            <p className="callout">👆 <strong>You're the host.</strong> Tap anything you ate or shared. Your part is already covered, so you won't pay for it.</p>
          )}
        </div>

        <section>
          <p className="sound-toggle">
            {soundOn ? (
              <button className="btn ghost small" onClick={() => setSound(false)}>🔊 Reading payments aloud · Turn off</button>
            ) : (
              <button
                className="btn ghost small"
                onClick={() => {
                  setSoundError(null);
                  setSound(true);
                  announce("test");
                }}
              >
                🔈 Read payments out loud
              </button>
            )}
          </p>
          {soundOn && !audioAllowed && (
            <div className="sound-prompt" role="status">
              <span aria-hidden="true">🔇</span>
              <span>Tap anywhere once so Tabby can read payments aloud.</span>
            </div>
          )}
          {soundError && <p className="error" style={{ marginTop: 0 }}>{soundError}</p>}
          {s.settled ? (
            <div className="settled" aria-live="polite">
              <span className={`stamp big${settledFresh ? " fresh" : ""}`}>Settled</span>
              <div>
                <h2>{host} is paid back.</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {money(s.collected)} from {s.guests.length} {s.guests.length === 1 ? "friend" : "friends"}, settled on Solana. Nobody has to chase anyone.
                </p>
                <Link href="/" className="btn small" style={{ marginTop: "1rem" }}>Start a new bill</Link>
              </div>
            </div>
          ) : (
            <div className="join">
              {joinUrl && <QR value={joinUrl} alt="QR code to join this bill" />}
              <div>
                <h2>Friends: scan this to pay {host} back</h2>
                <ol className="mini-steps">
                  <li>Open your phone's camera and point it here</li>
                  <li>{s.evenSplit ? "Enter your name" : "Tap your share of the host's tab (shared items too)"}</li>
                  <li>Tap <strong>Pay {host} back</strong></li>
                </ol>
                <p className="muted" style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>No app or account needed.</p>
                <div className="share-row">
                  <button className="btn ghost small" onClick={shareBill}>📤 Send to group chat</button>
                  {shareNote && <span className="share-note" role="status">{shareNote}</span>}
                </div>
              </div>
            </div>
          )}

          <h2 style={{ marginBottom: "0.2rem" }}>{host} fronted {money(s.total)}</h2>
          {s.evenSplit && (
            <p style={{ margin: "0 0 0.2rem" }}>
              Split evenly {s.evenSplit} ways: <strong>{money(s.evenShare ?? 0)}</strong> each
            </p>
          )}
          <p className="muted" style={{ margin: 0 }}>
            {money(s.collected)} paid back
            {s.toGo > 0 ? ` · ${money(s.toGo)} to go` : ""}
            {s.unassigned > 0 ? ` · ${money(s.unassigned)} unclaimed` : ""}
          </p>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>

          {hostCanEdit && !anyPaid && (
            <div className="mode-row">
              {s.evenSplit ? (
                <>
                  <span>Split evenly between</span>
                  <div className="stepper">
                    <button type="button" aria-label="Fewer people" disabled={!!busy || s.evenSplit <= 2} onClick={() => hostAction("set-even", undefined, s.evenSplit! - 1)}>−</button>
                    <span>{s.evenSplit}</span>
                    <button type="button" aria-label="More people" disabled={!!busy} onClick={() => hostAction("set-even", undefined, s.evenSplit! + 1)}>+</button>
                  </div>
                  <span>people</span>
                  <button className="link" disabled={!!busy} onClick={() => hostAction("set-even", undefined, null)}>Split by items instead</button>
                </>
              ) : (
                <>
                  <span>Everyone pays for what they got.</span>
                  <button className="link" disabled={!!busy} onClick={() => hostAction("set-even", undefined, Math.max(2, s.guests.length + 1))}>
                    Split evenly instead
                  </button>
                </>
              )}
            </div>
          )}

          {s.unclaimedCount > 0 && !s.splitLeftovers && s.guests.length > 0 && (
            <div className="leftovers">
              <p style={{ margin: 0 }}>
                <strong>{s.unclaimedCount} {s.unclaimedCount === 1 ? "item nobody has claimed" : "items nobody has claimed"}</strong> ({money(s.unclaimedTotal)})
              </p>
              {hostCanEdit && <p className="muted" style={{ margin: 0, fontSize: "0.85rem", flexBasis: "100%" }}>Shared something? Split it between everyone, or pay for it yourself.</p>}
              {hostCanEdit ? (
                <div className="row">
                  {!sharesLocked && (
                    <button className="btn ghost small" onClick={() => hostAction("split-rest")} disabled={!!busy}>Split evenly</button>
                  )}
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
              {hostCanEdit && !sharesLocked && (
                <button className="link" onClick={() => hostAction("unsplit")} disabled={!!busy}>Undo</button>
              )}
            </div>
          )}
          {actionError && <p className="error">{actionError}</p>}

          <div aria-live="polite">
            <div className="person">
              <span>
                <span className="person-name">{host}</span>
                <span className="chain-link">Paid the bill</span>
              </span>
              <span className="row">
                {s.hostShare > 0 ? (
                  <span className="person-amt">
                    {money(s.hostShare)} <span className="amt-note">own share</span>
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: "0.9rem" }}>Hasn't picked their items yet</span>
                )}
                <span className="host-tag">Host</span>
              </span>
            </div>
            {s.guests.length === 0 && <p className="muted waiting"><span className="spinner small" aria-hidden="true" /> Waiting for friends to scan the code…</p>}
            {s.guests.map((g) => {
              const sig = g.settled && g.owed > 0 ? latestSignature(g.name, payments) : null;
              return (
                <div className="person" key={g.name}>
                  <span>
                    <span className="person-name">{g.name}</span>
                    {sig && (
                      <a className="chain-link" href={explorerTx(sig)} target="_blank" rel="noreferrer">
                        See proof of payment ↗
                      </a>
                    )}
                  </span>
                  <span className="row">
                    <span className="person-amt">{money(g.owed)}</span>
                    {g.settled && g.owed > 0 ? (
                      <span className={`stamp${fresh.has(g.name) ? " fresh" : ""}`}>Paid</span>
                    ) : (
                      <>
                        <span className="muted" style={{ fontSize: "0.9rem" }}>{g.paid > 0 ? `${money(g.owed - g.paid)} left` : "Not paid"}</span>
                        {isHostDevice && g.owed > 0 && (
                          <button
                            className={`remind-btn${reminded.has(g.name) ? " sent" : ""}`}
                            onClick={() => remind(g.name, round2(g.owed - g.paid))}
                          >
                            {reminded.has(g.name) ? "Reminded ✓" : "Remind"}
                          </button>
                        )}
                      </>
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

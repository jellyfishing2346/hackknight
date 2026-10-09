"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useBill } from "@/app/components/useBill";
import { QR } from "@/app/components/QR";
import { billTotal, money, people } from "@/lib/split";

/** The laptop screen in the middle of the table. */
export default function LiveBill() {
  const { id } = useParams<{ id: string }>();
  const { state, error } = useBill(id);
  const [joinUrl, setJoinUrl] = useState("");
  const seenPaid = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => setJoinUrl(`${window.location.origin}/bill/${id}/claim`), [id]);

  const list = state ? people(state.bill, state.items, state.payments) : [];

  // Stamp animation only for people who just settled, not on first load.
  useEffect(() => {
    if (!state) return;
    const settled = new Set(list.filter((p) => p.settled).map((p) => p.name));
    if (seenPaid.current) {
      const newly = [...settled].filter((n) => !seenPaid.current!.has(n));
      if (newly.length) setFresh(new Set(newly));
    }
    seenPaid.current = settled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return <main className="page"><p className={error ? "error" : "muted"}>{error ?? "Loading bill…"}</p></main>;

  const { bill, items } = state;
  const total = billTotal(bill, items);
  const collected = list.reduce((s, p) => s + Math.min(p.paid, p.owed), 0);
  const pct = total > 0 ? Math.min(100, (collected / total) * 100) : 0;
  const unclaimed = items.filter((i) => !i.claimed_by).length;

  return (
    <main className="page wide">
      <p className="brand">Tabby</p>
      <div className="live">
        <div className="receipt-wrap">
          <div className="receipt">
            <p className="receipt-title">{bill.title}</p>
            <p className="receipt-sub">{new Date(bill.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
            <hr className="rule" />
            {items.map((i) => (
              <div className="line" key={i.id}>
                <span className="name">
                  {i.name}
                  <span className="who">{i.claimed_by ?? "Unclaimed"}</span>
                </span>
                <span className="price">{money(i.price)}</span>
              </div>
            ))}
            <hr className="rule" />
            <div className="line"><span>Tax</span><span className="price">{money(bill.tax)}</span></div>
            <div className="line"><span>Tip</span><span className="price">{money(bill.tip)}</span></div>
            <hr className="rule" />
            <div className="line total"><span>Total</span><span className="price">{money(total)}</span></div>
          </div>
        </div>

        <section>
          <div className="join">
            {joinUrl && <QR value={joinUrl} alt="QR code to join this bill" />}
            <div>
              <h2>Scan to claim your items</h2>
              <p className="muted" style={{ margin: 0 }}>
                {unclaimed === 0 ? "Every item is claimed." : `${unclaimed} item${unclaimed === 1 ? "" : "s"} still unclaimed.`}
              </p>
            </div>
          </div>

          <h2 style={{ marginBottom: 0 }}>{money(collected)} of {money(total)} collected</h2>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>

          {list.length === 0 && <p className="muted">Nobody has joined yet.</p>}
          <div aria-live="polite">
            {list.map((p) => (
              <div className="person" key={p.name}>
                <span className="person-name">{p.name}</span>
                <span className="row">
                  <span className="person-amt">{money(p.owed)}</span>
                  {p.settled ? (
                    <span className={`stamp${fresh.has(p.name) ? " fresh" : ""}`}>Paid</span>
                  ) : (
                    <span className="muted" style={{ fontSize: "0.9rem" }}>{p.paid > 0 ? `${money(p.owed - p.paid)} left` : "Not paid"}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

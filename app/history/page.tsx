"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/app/components/Brand";
import { readJson } from "@/app/components/api";
import { readHistory, removeFromHistory } from "@/app/components/history";
import { money, split } from "@/lib/split";
import type { BillState } from "@/lib/types";

type Row = { id: string; state: BillState };

export default function History() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    const ids = readHistory();
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/bills/${id}`, { cache: "no-store" });
          const state = await readJson<BillState>(res);
          return { id, state } as Row;
        } catch {
          // Gone from the database, or from a different deployment: drop it quietly.
          removeFromHistory(id);
          return null;
        }
      }),
    )
      .then((found) => setRows(found.filter((r): r is Row => r !== null)))
      .catch((e) => setError((e as Error).message));
  }, []);

  async function getInsights() {
    if (!rows || rows.length === 0) return;
    setInsightsBusy(true);
    setInsightsError(null);
    setInsights(null);
    try {
      const bills = rows.map(({ state }) => {
        const s = split(state.bill, state.items, state.payments);
        const outstanding = s.owedToHost + s.unassigned;
        return {
          title: state.bill.title,
          date: state.bill.created_at,
          total: s.total,
          collected: s.collected,
          toGo: Math.max(0, outstanding - s.collected),
          settled: s.settled,
          unpaid: s.guests.filter((g) => !g.settled && g.owed > 0).map((g) => ({ name: g.name, amount: Math.max(0, g.owed - g.paid) })),
        };
      });
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bills }),
      });
      const data = await readJson<{ summary: string }>(res);
      setInsights(data.summary);
    } catch (e) {
      setInsightsError((e as Error).message);
    } finally {
      setInsightsBusy(false);
    }
  }

  return (
    <main className="page wide">
      <Brand />
      <h1>Your tabs</h1>
      <p className="lede">Every tab you've started on this device, and who still owes you.</p>

      {error && <p className="error">{error}</p>}
      {rows === null && <p className="muted">Loading your tabs…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="muted">No tabs yet. <Link href="/" className="link">Start one</Link>.</p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="insights">
          {!insights && (
            <button className="btn ghost small" onClick={getInsights} disabled={insightsBusy}>
              {insightsBusy ? "Thinking…" : "✨ Get AI insights"}
            </button>
          )}
          {insightsError && <p className="error">{insightsError}</p>}
          {insights && (
            <div className="insights-card">
              <span className="insights-label">✨ Your spending, summarized</span>
              <p>{insights}</p>
              <button className="link quiet" onClick={getInsights} disabled={insightsBusy}>
                {insightsBusy ? "Thinking…" : "Refresh"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="history-list">
        {rows?.map(({ id, state }) => {
          const s = split(state.bill, state.items, state.payments);
          const outstanding = s.owedToHost + s.unassigned;
          const pct = outstanding > 0 ? Math.min(100, (s.collected / outstanding) * 100) : 100;
          return (
            <Link href={`/bill/${id}`} className="history-card" key={id}>
              <div className="history-top">
                <span className="history-title">{state.bill.title}</span>
                <span className={`stamp${s.settled ? "" : " muted-stamp"}`}>{s.settled ? "Settled" : "In progress"}</span>
              </div>
              <span className="history-date">
                {new Date(state.bill.created_at).toLocaleDateString([], { dateStyle: "medium" })}
              </span>
              <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <span className="history-amt">
                {s.settled
                  ? `${money(s.collected)} collected`
                  : `${money(s.collected)} of ${money(outstanding)} paid back${s.toGo > 0 ? ` · ${money(s.toGo)} owed` : ""}`}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

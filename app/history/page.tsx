"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/app/components/Brand";
import { readJson } from "@/app/components/api";
import { readHistory, removeFromHistory } from "@/app/components/history";
import { money, round2, split } from "@/lib/split";
import type { BillState } from "@/lib/types";
import { TrendsChart, type MonthBucket } from "@/app/components/TrendsChart";
import { CATEGORIES } from "@/lib/categories";

type Row = { id: string; state: BillState };

export default function History() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<MonthBucket[] | null>(null);
  const [trendsBusy, setTrendsBusy] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

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

  async function getTrends() {
    if (!rows || rows.length === 0) return;
    setTrendsBusy(true);
    setTrendsError(null);
    try {
      const bills = rows.map(({ id, state }) => ({ id, title: state.bill.title, items: state.items.map((i) => i.name) }));
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bills }),
      });
      const data = await readJson<{ categories: { id: string; category: string }[] }>(res);
      const categoryById = new Map(data.categories.map((c) => [c.id, c.category]));

      const byMonth = new Map<string, MonthBucket>();
      for (const { id, state } of rows) {
        const s = split(state.bill, state.items, state.payments);
        const d = new Date(state.bill.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString([], { month: "short", year: "numeric" });
        const category = categoryById.get(id) ?? "Other";

        let bucket = byMonth.get(key);
        if (!bucket) {
          bucket = { key, label, total: 0, segments: CATEGORIES.map((c) => ({ category: c, value: 0 })) };
          byMonth.set(key, bucket);
        }
        bucket.total = round2(bucket.total + s.total);
        const seg = bucket.segments.find((x) => x.category === category);
        if (seg) seg.value = round2(seg.value + s.total);
      }
      setMonths([...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)));
    } catch (e) {
      setTrendsError((e as Error).message);
    } finally {
      setTrendsBusy(false);
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
          {!months && (
            <button className="btn ghost small" onClick={getTrends} disabled={trendsBusy}>
              {trendsBusy ? "Crunching…" : "📊 Spending trends"}
            </button>
          )}
          {trendsError && <p className="error">{trendsError}</p>}
          {months && <TrendsChart months={months} />}
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

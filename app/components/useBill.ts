"use client";
import { readJson } from "@/app/components/api";
import { useCallback, useEffect, useState } from "react";
import type { BillState } from "@/lib/types";

/** Polls the bill every couple of seconds. Each poll also checks Solana for new payments. */
export function useBill(id: string, intervalMs = 2500) {
  const [state, setState] = useState<BillState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/bills/${id}`, { cache: "no-store" });
      const data = await readJson<any>(res);
      setState(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { state, error, refresh };
}

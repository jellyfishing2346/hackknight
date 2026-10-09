import "server-only";
import { db } from "./supabase";
import type { Bill, BillState, Item, Payment } from "./types";

// Supabase returns numeric columns as strings, so convert them once here.
const num = (v: unknown) => Number(v ?? 0);

export async function loadBill(id: string): Promise<BillState | null> {
  const supa = db();
  const [{ data: bill }, { data: items }, { data: payments }] = await Promise.all([
    supa.from("bills").select("*").eq("id", id).maybeSingle(),
    supa.from("items").select("*").eq("bill_id", id).order("position"),
    supa.from("payments").select("*").eq("bill_id", id).order("created_at"),
  ]);
  if (!bill) return null;
  return {
    bill: { ...bill, tax: num(bill.tax), tip: num(bill.tip) } as Bill,
    items: (items ?? []).map((i) => ({ ...i, price: num(i.price) })) as Item[],
    payments: (payments ?? []).map((p) => ({ ...p, amount: num(p.amount) })) as Payment[],
  };
}

import "server-only";
import { db } from "./supabase";
import type { Bill, BillState, Item, Payment } from "./types";

// Supabase returns numeric columns as strings, so convert them once here.
const num = (v: unknown) => Number(v ?? 0);

/** Public bill state. Never includes the host's private key. */
export async function loadBill(id: string): Promise<BillState | null> {
  const supa = db();
  const [{ data: bill }, { data: items }, { data: payments }] = await Promise.all([
    supa.from("bills").select("id, title, tax, tip, host_name, host_wallet, split_leftovers, created_at").eq("id", id).maybeSingle(),
    supa.from("items").select("*").eq("bill_id", id).order("position"),
    supa.from("payments").select("*").eq("bill_id", id).order("created_at"),
  ]);
  if (!bill) return null;
  return {
    bill: { ...bill, tax: num(bill.tax), tip: num(bill.tip), split_leftovers: !!bill.split_leftovers } as Bill,
    items: (items ?? []).map((i) => ({ ...i, price: num(i.price) })) as Item[],
    payments: (payments ?? []).map((p) => ({ ...p, amount: num(p.amount) })) as Payment[],
  };
}

/** True when the token matches the one handed to the host's browser at creation. */
export async function isHost(billId: string, token: string | undefined) {
  if (!token) return false;
  const { data } = await db().from("bills").select("host_token").eq("id", billId).maybeSingle();
  return !!data?.host_token && data.host_token === token;
}

/** Where this bill's repayments go: the host's own wallet, or the app's demo wallet. */
export function recipientFor(bill: Bill) {
  return bill.host_wallet || process.env.MERCHANT_WALLET!;
}

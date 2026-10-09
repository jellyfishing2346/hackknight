import "server-only";
import { db } from "./supabase";
import { loadBill } from "./bills";
import { shareFor } from "./split";
import { newReference } from "./solana";
import type { Payment } from "./types";

type Prepared = { ok: true; payment: Payment; amount: number } | { ok: false; status: number; error: string };

/** Work out what this person still owes and create (or reuse) a pending payment for it. */
export async function preparePayment(billId: string, name: string): Promise<Prepared> {
  if (!name?.trim()) return { ok: false, status: 400, error: "Enter your name first." };

  const state = await loadBill(billId);
  if (!state) return { ok: false, status: 404, error: "Bill not found." };

  const share = shareFor(name, state.items, state.bill);
  const alreadyPaid = state.payments
    .filter((p) => p.payer_name === name && p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const amount = Math.round((share.total - alreadyPaid) * 100) / 100;
  if (amount <= 0) return { ok: false, status: 400, error: "Nothing left to pay. Tap the items you ordered." };

  // Reuse an open request for the same amount so a double-tap doesn't create two.
  const existing = state.payments.find((p) => p.payer_name === name && p.status === "pending" && p.amount === amount);
  if (existing) return { ok: true, payment: existing, amount };

  const { data, error } = await db()
    .from("payments")
    .insert({ bill_id: billId, payer_name: name, amount, reference: await newReference() })
    .select("*")
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? "Couldn't start payment." };
  return { ok: true, payment: { ...data, amount: Number(data.amount) } as Payment, amount };
}

import "server-only";
import { db } from "./supabase";
import { loadBill, recipientFor } from "./bills";
import { amountLeft, sameName, split } from "./split";
import { newReference } from "./solana";
import type { Payment } from "./types";

type Prepared =
  | { ok: true; payment: Payment; amount: number; recipient: string; hostName: string; memo: string }
  | { ok: false; status: number; error: string };

/** Work out what this person still owes the host and create (or reuse) a pending payment for it. */
export async function preparePayment(billId: string, name: string): Promise<Prepared> {
  if (!name?.trim()) return { ok: false, status: 400, error: "Enter your name first." };

  const state = await loadBill(billId);
  if (!state) return { ok: false, status: 404, error: "Bill not found." };
  if (sameName(name, state.bill.host_name)) {
    return { ok: false, status: 400, error: `${state.bill.host_name} paid the bill, so there's nothing to pay back.` };
  }

  const s = split(state.bill, state.items, state.payments);
  // Splitting evenly: once every share is paid, nobody else should pay.
  if (s.evenSplit && !s.guests.some((g) => sameName(g.name, name))) {
    const paidGuests = s.guests.filter((g) => g.paid >= (s.evenShare ?? 0) - 0.005).length;
    if (paidGuests >= s.evenSplit - 1) {
      return { ok: false, status: 409, error: `All ${s.evenSplit - 1} shares are already paid. ${state.bill.host_name} is all square!` };
    }
  }
  const amount = amountLeft(s, name);
  if (amount <= 0) return { ok: false, status: 400, error: "Nothing left to pay. Tap the items that are yours." };

  const recipient = recipientFor(state.bill);
  const hostName = state.bill.host_name;
  // A readable note stored on-chain with the payment, visible on Solana Explorer.
  const memo = `Tabby: ${name.trim()} paid ${hostName} back · ${state.bill.title}`.slice(0, 120);

  // Reuse an open request for the same amount so a double-tap doesn't create two.
  const existing = state.payments.find((p) => sameName(p.payer_name, name) && p.status === "pending" && p.amount === amount);
  if (existing) return { ok: true, payment: existing, amount, recipient, hostName, memo };

  const { data, error } = await db()
    .from("payments")
    .insert({ bill_id: billId, payer_name: name.trim(), amount, reference: await newReference() })
    .select("*")
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? "Couldn't start payment." };
  return { ok: true, payment: { ...data, amount: Number(data.amount) } as Payment, amount, recipient, hostName, memo };
}

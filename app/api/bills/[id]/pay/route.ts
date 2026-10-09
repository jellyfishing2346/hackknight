import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { loadBill } from "@/lib/bills";
import { shareFor } from "@/lib/split";
import { newReference, paymentURL } from "@/lib/solana";

/** Create (or reuse) a payment request for one person's share and return its Solana Pay URL. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Enter your name first." }, { status: 400 });

  const state = await loadBill(id);
  if (!state) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

  const share = shareFor(name, state.items, state.bill);
  const alreadyPaid = state.payments
    .filter((p) => p.payer_name === name && p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const amount = Math.round((share.total - alreadyPaid) * 100) / 100;
  if (amount <= 0) return NextResponse.json({ error: "Nothing left to pay. Tap the items you ordered." }, { status: 400 });

  // Reuse an open request for the same amount so a double-tap doesn't create two.
  let payment = state.payments.find((p) => p.payer_name === name && p.status === "pending" && p.amount === amount);
  if (!payment) {
    const { data, error } = await db()
      .from("payments")
      .insert({ bill_id: id, payer_name: name, amount, reference: await newReference() })
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't start payment." }, { status: 500 });
    payment = { ...data, amount: Number(data.amount) };
  }

  return NextResponse.json({ payment, url: paymentURL(amount, payment!.reference, name) });
}

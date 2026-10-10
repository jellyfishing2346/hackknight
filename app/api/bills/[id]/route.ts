import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { loadBill, recipientFor } from "@/lib/bills";
import { checkPayment } from "@/lib/solana";

export const dynamic = "force-dynamic";

/** Current bill state. Also checks Solana for any pending payments and marks them paid. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let state;
  try {
    state = await loadBill(id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  if (!state) return NextResponse.json({ error: "Bill not found. Check the link, or the bill may have been created on a different database." }, { status: 404 });

  const pending = state.payments.filter((p) => p.status === "pending");
  if (pending.length > 0) {
    const recipient = recipientFor(state.bill);
    const results = await Promise.all(pending.map((p) => checkPayment(recipient, p.reference, p.amount)));
    const supa = db();
    await Promise.all(
      pending.map(async (p, i) => {
        const signature = results[i];
        if (!signature) return;
        await supa.from("payments").update({ status: "paid", signature }).eq("id", p.id);
        p.status = "paid";
        p.signature = signature;
      }),
    );
  }
  return NextResponse.json(state);
}

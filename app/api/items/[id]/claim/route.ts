import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { loadBill } from "@/lib/bills";
import { hasClaimed, sameName } from "@/lib/split";

/**
 * A guest joins an item ({ name, claim: true }) or leaves it ({ name, claim: false }).
 * Several people can share an item; its price is split evenly between them.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { name?: string; claim?: boolean };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Enter your name first." }, { status: 400 });

  const supa = db();
  const { data: row } = await supa.from("items").select("bill_id").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const state = await loadBill(row.bill_id);
  if (!state) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  const item = state.items.find((i) => i.id === id)!;
  const host = state.bill.host_name;

  if (sameName(name, host)) {
    return NextResponse.json({ error: `${host} is the host. Pick your own name to claim items.` }, { status: 400 });
  }
  if (state.bill.even_split) {
    return NextResponse.json({ error: "This bill is split evenly, so there's no need to pick items." }, { status: 400 });
  }

  const hasPaid = (n: string) => state.payments.some((p) => sameName(p.payer_name, n) && p.status === "paid");

  if (body.claim) {
    // Sharing an item lowers the others' shares, which would leave anyone who already paid overcharged.
    const paidSharer = item.claimers.find((c) => !sameName(c, name) && !sameName(c, host) && hasPaid(c));
    if (paidSharer) {
      return NextResponse.json(
        { error: `${paidSharer} already paid for this, so it can't be shared now. Ask ${host} to sort it out.` },
        { status: 409 },
      );
    }
  } else {
    if (!hasClaimed(item, name)) return NextResponse.json({ ok: true });
    // Once you've paid, your items are locked so your total can't drop below what you sent.
    if (hasPaid(name)) {
      return NextResponse.json({ error: "You've already paid for this, so it's locked in." }, { status: 409 });
    }
  }

  const { error } = await supa.rpc("claim_item", { p_item: id, p_name: name, p_claim: !!body.claim });
  if (error) {
    const hint = /claim_item/.test(error.message) ? " Run supabase/migrations/003_shared_items.sql in Supabase." : "";
    return NextResponse.json({ error: `Couldn't update the item: ${error.message}.${hint}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

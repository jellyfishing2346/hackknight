import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { sameName } from "@/lib/split";

/** A guest claims an item ({ name, claim: true }) or lets go of it ({ name, claim: false }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { name?: string; claim?: boolean };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Enter your name first." }, { status: 400 });

  const supa = db();
  const { data: item } = await supa.from("items").select("bill_id, claimed_by").eq("id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const { data: bill } = await supa.from("bills").select("host_name").eq("id", item.bill_id).maybeSingle();

  if (bill && sameName(name, bill.host_name)) {
    return NextResponse.json({ error: `${bill.host_name} is the host. Pick your own name to claim items.` }, { status: 400 });
  }

  if (body.claim) {
    if (item.claimed_by && !sameName(item.claimed_by, name)) {
      return NextResponse.json({ error: `${item.claimed_by} already claimed this.` }, { status: 409 });
    }
    await supa.from("items").update({ claimed_by: name }).eq("id", id).is("claimed_by", null);
    return NextResponse.json({ ok: true });
  }

  // Releasing an item. Once someone has paid, their items are locked so their total can't drop below what they sent.
  if (!sameName(item.claimed_by, name)) return NextResponse.json({ ok: true });
  const { data: paid } = await supa
    .from("payments")
    .select("payer_name")
    .eq("bill_id", item.bill_id)
    .eq("status", "paid");
  if ((paid ?? []).some((p) => sameName(p.payer_name, name))) {
    return NextResponse.json({ error: "You've already paid for this, so it's locked in." }, { status: 409 });
  }
  await supa.from("items").update({ claimed_by: null }).eq("id", id).eq("claimed_by", item.claimed_by!);
  return NextResponse.json({ ok: true });
}

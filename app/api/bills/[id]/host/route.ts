import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isHost, loadBill } from "@/lib/bills";
import { hasClaimed, sameName, split } from "@/lib/split";

type Body = {
  token?: string;
  action?: "claim-item" | "release-item" | "cover-rest" | "split-rest" | "unsplit" | "set-even";
  itemId?: string;
  /** set-even: split the whole bill this many ways, or null to go back to splitting by item. */
  count?: number | null;
};

/** Host-only controls, unlocked by the private token the host's browser got at creation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token, action, itemId, count } = (await req.json()) as Body;
  if (!(await isHost(id, token))) return NextResponse.json({ error: "Only the host can do that." }, { status: 403 });

  const state = await loadBill(id);
  if (!state) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  const host = state.bill.host_name;
  const supa = db();

  // Once a guest has paid, nothing may change what guests owe, or they'd be over- or under-charged.
  const anyPaid = state.payments.some((p) => p.status === "paid");
  const hasPaid = (n: string) => state.payments.some((p) => sameName(p.payer_name, n) && p.status === "paid");
  if (split(state.bill, state.items, state.payments).settled) {
    return NextResponse.json({ error: "This bill is settled, so it's locked." }, { status: 409 });
  }
  const locked = () =>
    NextResponse.json(
      { error: "Someone has already paid, so the split is locked. You can still cover leftovers yourself." },
      { status: 409 },
    );

  switch (action) {
    case "set-even": {
      if (anyPaid) return locked();
      const n = count && count >= 2 && count <= 50 ? Math.floor(count) : null;
      await supa.from("bills").update({ even_split: n }).eq("id", id);
      break;
    }
    case "claim-item":
    case "release-item": {
      const item = state.items.find((i) => i.id === itemId);
      if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
      // Joining or leaving changes the other sharers' parts, so not if any of them already paid.
      const paidSharer = item.claimers.some((c) => !sameName(c, host) && hasPaid(c));
      if (paidSharer || (state.bill.split_leftovers && anyPaid)) return locked();
      if ((action === "claim-item") === hasClaimed(item, host)) break;
      const { error } = await supa.rpc("claim_item", { p_item: item.id, p_name: host, p_claim: action === "claim-item" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "cover-rest": {
      // "I'll cover it": the host takes every unclaimed item as their own.
      if (state.bill.split_leftovers && anyPaid) return locked();
      const ids = state.items.filter((i) => i.claimers.length === 0).map((i) => i.id);
      if (ids.length) await supa.from("items").update({ claimers: [host] }).in("id", ids);
      await supa.from("bills").update({ split_leftovers: false }).eq("id", id);
      break;
    }
    case "split-rest":
    case "unsplit":
      if (anyPaid) return locked();
      await supa.from("bills").update({ split_leftovers: action === "split-rest" }).eq("id", id);
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

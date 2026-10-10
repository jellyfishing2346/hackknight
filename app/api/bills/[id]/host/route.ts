import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isHost, loadBill } from "@/lib/bills";
import { split } from "@/lib/split";

type Body = {
  token?: string;
  action?: "claim-item" | "release-item" | "cover-rest" | "split-rest" | "unsplit";
  itemId?: string;
};

/** Host-only controls, unlocked by the private token the host's browser got at creation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token, action, itemId } = (await req.json()) as Body;
  if (!(await isHost(id, token))) return NextResponse.json({ error: "Only the host can do that." }, { status: 403 });

  const state = await loadBill(id);
  if (!state) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  const host = state.bill.host_name;
  const supa = db();

  // Once a guest has paid, nothing may change what guests owe, or they'd be over- or under-charged.
  const anyPaid = state.payments.some((p) => p.status === "paid");
  if (split(state.bill, state.items, state.payments).settled) {
    return NextResponse.json({ error: "This bill is settled, so it's locked." }, { status: 409 });
  }
  const changesGuestShares =
    action === "split-rest" || action === "unsplit" || (state.bill.split_leftovers && action !== undefined);
  if (anyPaid && changesGuestShares) {
    return NextResponse.json(
      { error: "Someone has already paid, so the split is locked. You can still cover leftovers yourself." },
      { status: 409 },
    );
  }

  switch (action) {
    case "claim-item": {
      // The host marks one of their own items. Only unclaimed items can be taken.
      await supa.from("items").update({ claimed_by: host }).eq("id", itemId!).eq("bill_id", id).is("claimed_by", null);
      break;
    }
    case "release-item": {
      await supa.from("items").update({ claimed_by: null }).eq("id", itemId!).eq("bill_id", id).eq("claimed_by", host);
      break;
    }
    case "cover-rest": {
      // "I'll cover it": the host takes every unclaimed item as their own.
      await supa.from("items").update({ claimed_by: host }).eq("bill_id", id).is("claimed_by", null);
      await supa.from("bills").update({ split_leftovers: false }).eq("id", id);
      break;
    }
    case "split-rest":
      await supa.from("bills").update({ split_leftovers: true }).eq("id", id);
      break;
    case "unsplit":
      await supa.from("bills").update({ split_leftovers: false }).eq("id", id);
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

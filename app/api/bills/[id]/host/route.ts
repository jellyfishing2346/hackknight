import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { isHost, loadBill } from "@/lib/bills";

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

import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/** Claim an item ({ name, claim: true }) or let go of it ({ name, claim: false }). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, claim } = (await req.json()) as { name?: string; claim?: boolean };
  if (!name?.trim()) return NextResponse.json({ error: "Enter your name first." }, { status: 400 });

  const supa = db();
  const query = claim
    ? supa.from("items").update({ claimed_by: name }).eq("id", id).is("claimed_by", null)
    : supa.from("items").update({ claimed_by: null }).eq("id", id).eq("claimed_by", name);
  const { data, error } = await query.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data?.length && claim) {
    const { data: item } = await supa.from("items").select("claimed_by").eq("id", id).maybeSingle();
    if (item?.claimed_by && item.claimed_by !== name) {
      return NextResponse.json({ error: `${item.claimed_by} already claimed this.` }, { status: 409 });
    }
  }
  return NextResponse.json({ ok: true });
}

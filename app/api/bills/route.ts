import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { round2 } from "@/lib/split";

type Body = { title?: string; tax?: number; tip?: number; items?: { name: string; price: number }[] };

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const items = (body.items ?? []).filter((i) => i.name?.trim() && Number.isFinite(i.price));
  if (items.length === 0) return NextResponse.json({ error: "Add at least one item." }, { status: 400 });

  const supa = db();
  const { data: bill, error } = await supa
    .from("bills")
    .insert({ title: body.title?.trim() || "Dinner", tax: round2(body.tax ?? 0), tip: round2(body.tip ?? 0) })
    .select("id")
    .single();
  if (error || !bill) return NextResponse.json({ error: error?.message ?? "Couldn't save the bill." }, { status: 500 });

  const { error: itemsError } = await supa.from("items").insert(
    items.map((i, position) => ({ bill_id: bill.id, name: i.name.trim(), price: round2(i.price), position })),
  );
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json({ id: bill.id });
}

import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { loadBill } from "@/lib/bills";
import { hasClaimed, money, sameName } from "@/lib/split";
import { rateLimit } from "@/lib/ratelimit";
import { aiIsBusy } from "@/lib/ai";

export const maxDuration = 30;

const SYSTEM = `You help one person on a shared bill mark which items were theirs.
You get the bill's items (each with an id, name, price, and who already claimed it) and what the person said they had.

Rules:
- Only use item ids from the list. Never invent items.
- If they mention an item, include its id. If the bill has several identical items (two "Pizza" lines), pick as many as they say they had, preferring ones nobody has claimed yet.
- If they say they shared or split something ("half the guac", "we shared the fries"), include it. Shared items are fine even if someone else already claimed them.
- Items they already have are fine to include again.
- If nothing they said matches the list, return no matches and ask a short clarifying question.
- reply: one short, friendly sentence confirming what you'll mark, or asking what they meant.
- Always reply in the same language the person used.`;

const schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    itemIds: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["reply", "itemIds"],
};

/** "Tell Tabby what you had": match a guest's words to the bill's items. The guest confirms before anything is claimed. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "assist", 12);
  if (limited) return limited;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const { id } = await params;
  const { name, text } = (await req.json()) as { name?: string; text?: string };
  const said = (text ?? "").trim().slice(0, 1000);
  if (!name?.trim() || !said) return NextResponse.json({ error: "Say what you had first." }, { status: 400 });

  const state = await loadBill(id);
  if (!state) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  if (state.bill.even_split) return NextResponse.json({ error: "This bill is split evenly, so there's nothing to pick." }, { status: 400 });

  const list = state.items
    .map((i) => {
      const who = i.claimers.length ? i.claimers.join(", ") : "nobody";
      return `${i.id} | ${i.name} | ${money(i.price)} | claimed by: ${who}${hasClaimed(i, name) ? " (already theirs)" : ""}`;
    })
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: [{ role: "user", parts: [{ text: `Person: ${name.trim()}\n\nItems:\n${list}\n\nWhat they said: "${said}"` }] }],
      config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    });
    const out = JSON.parse(res.text ?? "{}") as { reply?: string; itemIds?: string[] };
    // Keep only real item ids, once each, in receipt order.
    const wanted = new Set(out.itemIds ?? []);
    const matches = state.items
      .filter((i) => wanted.has(i.id))
      .map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        alreadyMine: hasClaimed(i, name),
        sharedWith: i.claimers.filter((c) => !sameName(c, name)),
      }));
    return NextResponse.json({ reply: (out.reply ?? "").trim(), matches });
  } catch (err) {
    console.error("Guest assist failed:", err);
    if (aiIsBusy(err)) {
      return NextResponse.json({ error: "Tabby's AI is busy right now. Just tap your items on the receipt below." }, { status: 503 });
    }
    return NextResponse.json({ error: "Tabby couldn't work that out just now. Try again, or tap your items." }, { status: 502 });
  }
}

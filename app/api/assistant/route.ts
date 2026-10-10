import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { normalizeDraft, type RawDraft } from "@/lib/assistant";

export const maxDuration = 30;

const SYSTEM = `You are Tabby AI, inside an app where one friend paid a group bill and everyone else pays them back.
The user describes the bill in plain words (often by voice). Build the bill from everything said so far.

Rules:
- Every item needs a price. Never invent prices. If an item has no price, ask for it.
- When quantity is more than 1, name ONE unit ("2 burgers" -> name "Burger", quantity 2). Otherwise keep the name as said ("Wings", "Fries", "Chips & guac").
- "price" is the total for that line. If they say "2 pizzas at $18 each", use quantity 2 and price 36.
- Tax and tip: if given in dollars, put them in tax/tip. If given as a percent, put the number in taxPercent/tipPercent and leave tax/tip at 0.
- If they want to split evenly ("split evenly", "split 4 ways", "between the 4 of us"), set splitMode "even" and people to the total number of people including the person who paid. Otherwise splitMode "items".
- If they say who paid ("I'm Sam", "Sam paid"), put that name in hostName.
- merchant is the name of the place, vendor, or occasion the bill is for, or "Tab" if unknown.
- Always return the full, current draft built from the whole conversation, not just the latest message. Use draft null only if there is no item with a price yet.
- reply: one or two short, friendly sentences. If the draft is usable, summarize it in a few words and say they can tap "Use this bill" or keep adding. If something essential is missing, ask one clear question.
- Only help with splitting bills. Politely steer anything else back to the bill.
- Always reply in the same language the user writes or speaks, and keep item names in their words and language (apart from the quantity rule above).`;

const schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    draft: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        merchant: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { name: { type: Type.STRING }, price: { type: Type.NUMBER }, quantity: { type: Type.NUMBER } },
            required: ["name", "price"],
          },
        },
        tax: { type: Type.NUMBER },
        tip: { type: Type.NUMBER },
        taxPercent: { type: Type.NUMBER },
        tipPercent: { type: Type.NUMBER },
        splitMode: { type: Type.STRING, enum: ["items", "even"] },
        people: { type: Type.NUMBER },
        hostName: { type: Type.STRING },
      },
      required: ["merchant", "items"],
    },
  },
  required: ["reply"],
};

type Msg = { role: "user" | "assistant"; text: string };

/** One chat turn with Tabby AI. Returns a reply plus the bill built from the whole conversation. */
export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const { messages } = (await req.json()) as { messages?: Msg[] };
  const history = (messages ?? [])
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .slice(-20)
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text.slice(0, 2000) }] }));
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Say something about your bill first." }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: history,
      config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    });
    const out = JSON.parse(res.text ?? "{}") as { reply?: string; draft?: RawDraft | null };
    return NextResponse.json({
      reply: (out.reply ?? "").trim() || "Tell me what you had and how much it cost.",
      draft: normalizeDraft(out.draft),
    });
  } catch (err) {
    console.error("Tabby AI failed:", err);
    return NextResponse.json({ error: "Tabby AI couldn't answer just now. Try again in a moment." }, { status: 502 });
  }
}

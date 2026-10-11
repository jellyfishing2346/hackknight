import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { aiIsBusy } from "@/lib/ai";
import { CATEGORIES } from "@/lib/categories";

export const maxDuration = 30;

const PROMPT = (bills: { id: string; title: string; items: string[] }[]) => `Categorize each of these tabs into exactly one category, based on the title and the items bought.

Categories (pick exactly one per tab): ${CATEGORIES.join(", ")}.

Tabs:
${JSON.stringify(bills)}

Return one category per tab id. If nothing fits well, use "Other".`;

const schema = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...CATEGORIES] },
        },
        required: ["id", "category"],
      },
    },
  },
  required: ["categories"],
};

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const { bills } = (await req.json()) as { bills?: { id: string; title: string; items: string[] }[] };
  if (!bills || bills.length === 0) {
    return NextResponse.json({ error: "No tabs to categorize yet." }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: [{ text: PROMPT(bills) }],
      config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    });
    const out = JSON.parse(res.text ?? "{}") as { categories?: { id: string; category: string }[] };
    const byId = new Map((out.categories ?? []).map((c) => [c.id, c.category]));
    // Anything Gemini skipped still gets a bucket, so every bill lands somewhere.
    const categories = bills.map((b) => ({ id: b.id, category: byId.get(b.id) ?? "Other" }));
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Categorize failed:", err);
    if (aiIsBusy(err)) {
      return NextResponse.json({ error: "Tabby's AI is busy right now. Try again in a minute." }, { status: 503 });
    }
    return NextResponse.json({ error: "Couldn't categorize your tabs just now. Try again in a moment." }, { status: 502 });
  }
}

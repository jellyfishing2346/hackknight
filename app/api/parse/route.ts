import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { round2 } from "@/lib/split";
import type { ParsedReceipt } from "@/lib/types";
import { error } from "console";

export const maxDuration = 30;

const PROMPT = `You are reading a photo of a restaurant or store receipt.
Return every purchased line item with its final price. If a line has a quantity, multiply it out.
Apply item-level discounts to that item's price.
Do not include subtotal, tax, tip, service charge, total, change, or payment-method lines as items.
Put tax in "tax". Put any printed tip or service charge in "tip"; use 0 if there is none.
Prices are plain numbers with no currency symbols.`;

const schema = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, price: { type: Type.NUMBER } },
        required: ["name", "price"],
      },
    },
    tax: { type: Type.NUMBER },
    tip: { type: Type.NUMBER },
  },
  required: ["merchant", "items", "tax", "tip"],
};

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf"
])

const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10 MB


export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const { image, mimeType } = (await req.json()) as { image?: string; mimeType?: string };
  if (!image) return NextResponse.json({ error: "No image was sent." }, { status: 400 });

  if (!SUPPORTED_MIME_TYPES.has(mimeType || "")) {
    return NextResponse.json({error: `Unsupported mime type: ${mimeType}. Supported types are ${Array.from(SUPPORTED_MIME_TYPES).join(",")}`}, {status: 415});
  }
  if(image.length > MAX_BASE64_SIZE){
    return NextResponse.json({error: "That file is too large. Try a smaller one."}, {status: 413});
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: [{ inlineData: { mimeType: mimeType || "image/jpeg", data: image } }, { text: PROMPT }],
      config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    });
    const raw = JSON.parse(res.text ?? "{}") as Partial<ParsedReceipt>;
    const clean: ParsedReceipt = {
      merchant: (raw.merchant || "").trim(),
      items: (raw.items ?? [])
        .filter((i) => i && i.name && Number.isFinite(i.price))
        .map((i) => ({ name: i.name.trim(), price: round2(i.price) })),
      tax: round2(Number(raw.tax) || 0),
      tip: round2(Number(raw.tip) || 0),
    };
    if (clean.items.length === 0) {
      return NextResponse.json({ error: "No items found on that receipt. Try a flatter, brighter photo." }, { status: 422 });
    }
    return NextResponse.json(clean);
  } catch (err) {
    console.error("Gemini parse failed:", err);
    return NextResponse.json({ error: "Couldn't read the receipt. Try again or type the items in." }, { status: 502 });
  }
}

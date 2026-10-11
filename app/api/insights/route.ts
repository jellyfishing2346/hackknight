import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 30;

type BillSummary = {
  title: string;
  date: string;
  total: number;
  collected: number;
  toGo: number;
  settled: boolean;
  unpaid: { name: string; amount: number }[];
};

const PROMPT = (bills: BillSummary[]) => `You are a financial assistant inside Tabby, an app for splitting shared bills and settling up on Solana.

Here is this person's tab history, as the host of every one of these (they fronted the money, everyone else pays them back):
${JSON.stringify(bills)}

Each tab has: title, date, the total amount, how much has been collected so far, how much is still outstanding ("toGo"), whether it's fully settled, and a list of exactly who still owes them money and how much.

Write a short, friendly summary (3-5 sentences, plain text, no markdown, no bullet points) of their shared-spending activity: how much they've fronted overall, anything still outstanding and specifically who it's from, and one notable pattern if there is one (a tab that's been open a while, a frequent non-payer, a big-ticket tab, etc.). Use only the names and dollar amounts given. Never invent a number or a person not in the data.`;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not set." }, { status: 500 });

  const { bills } = (await req.json()) as { bills?: BillSummary[] };
  if (!bills || bills.length === 0) {
    return NextResponse.json({ error: "No tabs to summarize yet." }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: [{ text: PROMPT(bills) }],
      config: { temperature: 0.3 },
    });
    const summary = (res.text ?? "").trim();
    if (!summary) return NextResponse.json({ error: "Couldn't generate insights just now." }, { status: 502 });
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Insights failed:", err);
    return NextResponse.json({ error: "Couldn't generate insights just now. Try again in a moment." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { connection } from "@/lib/transfer";

/** Send a wallet-signed transaction to devnet. The bill page detects it by its reference. */
export async function POST(req: Request) {
  const { transaction } = (await req.json()) as { transaction?: string };
  if (!transaction) return NextResponse.json({ error: "No transaction was sent." }, { status: 400 });
  try {
    const signature = await connection().sendRawTransaction(Buffer.from(transaction, "base64"), {
      preflightCommitment: "confirmed",
    });
    return NextResponse.json({ signature });
  } catch (err) {
    console.error("Send failed:", err);
    const msg = (err as Error).message || "";
    const friendly = msg.includes("insufficient")
      ? "This wallet doesn't have enough devnet SOL or test tokens. Fund it with npm run devnet fund."
      : msg.includes("Blockhash not found")
        ? "That took too long to approve. Tap Pay with Phantom again."
        : "The payment didn't go through. Check the terminal running npm run dev for details.";
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}

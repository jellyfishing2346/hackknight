import { NextResponse } from "next/server";
import { preparePayment } from "@/lib/payments";
import { payInstantly } from "@/lib/transfer";

export const maxDuration = 30;

/** One-tap payment: no wallet needed. Sends a real devnet transaction for this person's share. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };

  const prepared = await preparePayment(id, name ?? "");
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });

  try {
    const signature = await payInstantly(prepared.recipient, prepared.amount, prepared.payment.reference);
    return NextResponse.json({ signature });
  } catch (err) {
    console.error("Instant payment failed:", err);
    const msg = (err as Error).message || "";
    const friendly = msg.includes("ADMIN_SECRET_KEY")
      ? msg
      : msg.includes("insufficient") || msg.includes("0x1")
        ? "The admin wallet is out of devnet SOL. Top it up at faucet.solana.com."
        : "The payment didn't go through. Check the terminal running npm run dev for details.";
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}

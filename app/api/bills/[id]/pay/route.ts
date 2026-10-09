import { NextResponse } from "next/server";
import { preparePayment } from "@/lib/payments";
import { paymentURL } from "@/lib/solana";

/** Create (or reuse) a payment request for one person's share and return its Solana Pay URL. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };
  const prepared = await preparePayment(id, name ?? "");
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  const { payment, amount } = prepared;
  return NextResponse.json({ payment, url: paymentURL(amount, payment.reference, name!) });
}

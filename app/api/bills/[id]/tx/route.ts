import { NextResponse } from "next/server";
import { preparePayment } from "@/lib/payments";
import { buildTransfer } from "@/lib/transfer";

/** Build the unsigned transaction for this person's share, for their wallet to sign. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, account } = (await req.json()) as { name?: string; account?: string };
  if (!account) return NextResponse.json({ error: "Connect a wallet first." }, { status: 400 });

  const prepared = await preparePayment(id, name ?? "");
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });

  try {
    const transaction = await buildTransfer(account, prepared.amount, prepared.payment.reference);
    return NextResponse.json({ transaction, amount: prepared.amount });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

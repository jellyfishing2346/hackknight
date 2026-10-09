import "server-only";
import { address, createSolanaRpc, generateKeyPairSigner, type Address } from "@solana/kit";
import { encodeURL, findReference, validateTransfer, FindReferenceError } from "@solana/pay";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} in .env.local`);
  return v;
}

const rpc = () => createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
const recipient = (): Address => address(env("MERCHANT_WALLET"));
const splToken = (): Address => address(env("SPLIT_TOKEN_MINT"));

/** A fresh random address. It's attached to one payment so we can find that exact transaction later. */
export async function newReference(): Promise<string> {
  return (await generateKeyPairSigner()).address;
}

/** The solana: URL a wallet opens to pay this share. Also what the QR code encodes. */
export function paymentURL(amount: number, reference: string, payerName: string): string {
  return encodeURL({
    recipient: recipient(),
    amount,
    splToken: splToken(),
    reference: address(reference),
    label: "Tabby",
    message: `${payerName}'s share`,
  }).toString();
}

/**
 * Look for a transaction carrying this payment's reference and check it paid the right amount
 * to the right wallet. Returns the transaction signature once it has, otherwise null.
 */
export async function checkPayment(reference: string, amount: number): Promise<string | null> {
  try {
    const found = await findReference(rpc(), address(reference), { commitment: "confirmed" });
    await validateTransfer(
      rpc(),
      found.signature,
      { recipient: recipient(), amount, splToken: splToken(), reference: address(reference) },
      { commitment: "confirmed" },
    );
    return found.signature;
  } catch (err) {
    if (!(err instanceof FindReferenceError)) console.error("Payment check failed:", err);
    return null;
  }
}

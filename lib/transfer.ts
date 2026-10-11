import "server-only";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const DECIMALS = 6;
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * A readable note stored on-chain with the payment ("Tabby: Ana paid Sam back · Ski trip").
 * It goes BEFORE the transfer: Solana Pay's validateTransfer treats the last instruction as
 * the transfer and ignores earlier ones unless asked to check a memo.
 */
function memoInstruction(text: string) {
  return new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(text, "utf8") });
}

export function connection() {
  return new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
}

/**
 * Build an unsigned token transfer from the payer to the merchant wallet, tagged with the
 * payment's reference. The payer's wallet only has to sign it; the server sends it to devnet.
 * Shaped the way Solana Pay's validateTransfer expects: the transfer is the last instruction
 * and the reference is the extra account after the transfer's own accounts.
 */
export async function buildTransfer(payerAddress: string, recipient: string, amount: number, reference: string, memo?: string) {
  const payer = new PublicKey(payerAddress);
  const merchant = new PublicKey(recipient);
  const mint = new PublicKey(process.env.SPLIT_TOKEN_MINT!);

  if (payer.equals(merchant)) {
    throw new Error("This is the host's wallet, so it can't pay itself back. Switch to a different account in Phantom.");
  }

  const conn = connection();
  const from = getAssociatedTokenAddressSync(mint, payer);
  const to = getAssociatedTokenAddressSync(mint, merchant);

  // Clear message for the most common setup problem: a wallet that was never funded.
  try {
    const balance = await conn.getTokenAccountBalance(from);
    if ((balance.value.uiAmount ?? 0) < amount) {
      throw new Error(`This wallet only has ${balance.value.uiAmountString} test tokens. Fund it with: npm run devnet fund ${payerAddress} 200`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("This wallet")) throw err;
    throw new Error(`This wallet has no test tokens yet. Fund it with: npm run devnet fund ${payerAddress} 200`);
  }

  const transfer = createTransferCheckedInstruction(from, mint, to, payer, BigInt(Math.round(amount * 10 ** DECIMALS)), DECIMALS);
  transfer.keys.push({ pubkey: new PublicKey(reference), isSigner: false, isWritable: false });

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(
    createAssociatedTokenAccountIdempotentInstruction(payer, to, merchant, mint),
    ...(memo ? [memoInstruction(memo)] : []),
    transfer,
  );
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

/** The admin wallet from `npm run devnet init`. Pays fees and controls the test token. */
function adminKeypair() {
  const raw = process.env.ADMIN_SECRET_KEY;
  if (!raw) throw new Error("ADMIN_SECRET_KEY is not set. Run: npm run devnet export-admin");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

/**
 * One-tap payment with no wallet app. In a single devnet transaction:
 * the admin wallet pays the fees, creates a fresh one-time wallet's token account,
 * mints that wallet exactly the share, and the wallet sends it to the merchant
 * tagged with the payment reference. The transfer is last, so the usual
 * validateTransfer check verifies it like any other payment.
 */
export async function payInstantly(recipient: string, amount: number, reference: string, memo?: string) {
  const admin = adminKeypair();
  const payer = Keypair.generate();
  const merchant = new PublicKey(recipient);
  const mint = new PublicKey(process.env.SPLIT_TOKEN_MINT!);
  const units = BigInt(Math.round(amount * 10 ** DECIMALS));

  const from = getAssociatedTokenAddressSync(mint, payer.publicKey);
  const to = getAssociatedTokenAddressSync(mint, merchant);

  const transfer = createTransferCheckedInstruction(from, mint, to, payer.publicKey, units, DECIMALS);
  transfer.keys.push({ pubkey: new PublicKey(reference), isSigner: false, isWritable: false });

  const conn = connection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: admin.publicKey, blockhash, lastValidBlockHeight }).add(
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, from, payer.publicKey, mint),
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, to, merchant, mint),
    createMintToInstruction(mint, from, admin.publicKey, units),
    ...(memo ? [memoInstruction(memo)] : []),
    transfer,
  );
  tx.sign(admin, payer);

  const signature = await conn.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

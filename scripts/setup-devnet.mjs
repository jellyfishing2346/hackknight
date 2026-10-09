// Devnet helper. Run with: npm run devnet <command>
//
//   npm run devnet init                 One-time: creates an admin wallet and a 6-decimal test token
//                                       ("USDC" for the demo), and a token account for MERCHANT_WALLET.
//                                       Paste the printed SPLIT_TOKEN_MINT into .env.local.
//   npm run devnet fund <wallet> [100]  Sends a demo wallet 0.05 devnet SOL (for fees) and test tokens.
//   npm run devnet balance <wallet>     Shows a wallet's SOL and test-token balance.

import fs from "node:fs";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const ADMIN_FILE = ".devnet-admin.json";
const DECIMALS = 6;
const conn = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");

function loadAdmin() {
  if (fs.existsSync(ADMIN_FILE)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"))));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(ADMIN_FILE, JSON.stringify([...kp.secretKey]));
  console.log(`Created admin wallet ${kp.publicKey.toBase58()} (saved to ${ADMIN_FILE}, which is gitignored)`);
  return kp;
}

async function ensureSol(admin, min = 0.5) {
  const bal = (await conn.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL;
  if (bal >= min) return;
  console.log(`Admin has ${bal} SOL. Requesting a devnet airdrop…`);
  try {
    const sig = await conn.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  } catch {
    console.error(
      `\nThe airdrop was rate-limited. Get devnet SOL for this address at https://faucet.solana.com\n  ${admin.publicKey.toBase58()}\nthen run this command again.`,
    );
    process.exit(1);
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Set ${name} in .env.local first.`); process.exit(1); }
  return v;
}

const [cmd, arg, amountArg] = process.argv.slice(2);

if (cmd === "init") {
  const admin = loadAdmin();
  await ensureSol(admin);
  const merchant = new PublicKey(requireEnv("MERCHANT_WALLET"));
  let mint = process.env.SPLIT_TOKEN_MINT ? new PublicKey(process.env.SPLIT_TOKEN_MINT) : null;
  if (!mint) {
    mint = await createMint(conn, admin, admin.publicKey, null, DECIMALS);
    console.log(`Created test token ${mint.toBase58()}`);
  }
  // The person collecting payments needs a token account to receive into.
  await getOrCreateAssociatedTokenAccount(conn, admin, mint, merchant);
  console.log(`\nAdd this line to .env.local:\nSPLIT_TOKEN_MINT=${mint.toBase58()}\n`);
} else if (cmd === "fund") {
  if (!arg) { console.error("Usage: npm run devnet fund <wallet address> [amount]"); process.exit(1); }
  const admin = loadAdmin();
  await ensureSol(admin);
  const mint = new PublicKey(requireEnv("SPLIT_TOKEN_MINT"));
  const to = new PublicKey(arg);
  const amount = Number(amountArg || 100);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: to, lamports: 0.05 * LAMPORTS_PER_SOL }),
  ), [admin]);
  const ata = await getOrCreateAssociatedTokenAccount(conn, admin, mint, to);
  await mintTo(conn, admin, mint, ata.address, admin, BigInt(Math.round(amount * 10 ** DECIMALS)));
  console.log(`Sent 0.05 SOL and ${amount} test tokens to ${to.toBase58()}`);
} else if (cmd === "balance") {
  const owner = new PublicKey(arg);
  const sol = (await conn.getBalance(owner)) / LAMPORTS_PER_SOL;
  let tokens = 0;
  if (process.env.SPLIT_TOKEN_MINT) {
    try {
      const acct = await getAccount(conn, getAssociatedTokenAddressSync(new PublicKey(process.env.SPLIT_TOKEN_MINT), owner));
      tokens = Number(acct.amount) / 10 ** DECIMALS;
    } catch {}
  }
  console.log(`${owner.toBase58()}: ${sol} SOL, ${tokens} test tokens`);
} else {
  console.log("Commands: init | fund <wallet> [amount] | balance <wallet>");
}

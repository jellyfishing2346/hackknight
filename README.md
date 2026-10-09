# Tabby

Snap a receipt, everyone taps what they ordered, and each person pays their exact share in about a second on Solana.

Built at Hack Knight Fall 2026 for the Financial track, MLH Best Use of Solana, and MLH Best Use of Gemini API.

## How it works

1. The host photographs the receipt. **Gemini** reads it into line items, tax, and tip (`app/api/parse`).
2. The host checks the items and shares the bill. The laptop shows a QR code for the table (`app/bill/[id]`).
3. Each friend scans it, enters their name, and taps their items. Tax and tip are split in proportion to what they ordered (`lib/split.ts`).
4. "Pay my share" creates a **Solana Pay** request with a unique `reference` address (`app/api/bills/[id]/pay`). Their wallet opens and they approve.
5. The app watches Solana for a transaction carrying that reference, checks it paid the right amount to the right wallet, and marks the person paid (`lib/solana.ts`, called from `app/api/bills/[id]`).

There's no custom smart contract. Payments go straight from each friend's wallet to the host's wallet, and the `reference` is how we match a transaction to a person.

## Setup (about 20 minutes, do it together on night 1)

You need Node 20 or newer.

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
```

**1. Supabase.** Create a free project at supabase.com. In the SQL Editor, run `supabase/schema.sql`. Copy the project URL and the `service_role` key from Project Settings → API into `.env.local`.

**2. Gemini.** Get an API key at aistudio.google.com/apikey and put it in `GEMINI_API_KEY`.

**3. Host wallet.** Install Phantom, then turn on Settings → Developer Settings → Testnet Mode and select Solana Devnet. Copy the wallet address into `MERCHANT_WALLET`. This wallet receives every payment.

**4. Test money.** This creates a test token that stands in for USDC:

```bash
npm run devnet init
```

If the airdrop is rate-limited, paste the printed admin address into faucet.solana.com, then run it again. Copy the printed `SPLIT_TOKEN_MINT=` line into `.env.local`.

**5. Run it.**

```bash
npm run dev
```

Open http://localhost:3000 and click "Use a sample receipt" to try the flow without a photo.

## Phones need to reach the app

`localhost` only works on your laptop, so friends scanning the table QR need a public URL. **Deploy to Vercel early** (import the GitHub repo and add the same env vars). Vercel also gives you HTTPS, which phone cameras and wallet links behave better with.

## Demo phones (owner: D)

For each demo phone:

1. Install Phantom, create a wallet, and switch it to Devnet (step 3 above).
2. Fund it: `npm run devnet fund <phone wallet address> 200`
3. Check it: `npm run devnet balance <phone wallet address>`

Then run the full flow on every phone at least once before judging. If "Open in wallet" doesn't launch Phantom from the phone's browser, open the claim page inside Phantom's built-in browser instead, or scan the payment QR with Phantom's scanner.

## Who owns what

| Person | Files | First milestone |
|---|---|---|
| A: Solana | `lib/solana.ts`, `app/api/bills/[id]/pay`, `app/api/bills/[id]`, `scripts/setup-devnet.mjs` | One real devnet payment flips someone to Paid |
| B: Gemini | `app/api/parse/route.ts` | 5 of D's test receipts parse correctly |
| C: Frontend | `app/page.tsx`, `app/bill/**`, `app/globals.css`, `lib/split.ts` | Full flow works with the sample receipt |
| D: Design, demo, pitch | Figma, demo phones, test receipts, Devpost, pitch | Demo phones funded and paying |

## Troubleshooting

- **Stuck on "Pay my share" after paying:** the page checks Solana every 2 seconds. If it never flips, run `npm run devnet balance` on the host wallet to see whether the tokens arrived. If the public devnet RPC is slow or rate-limited, get a free devnet RPC URL from Helius and set `SOLANA_RPC_URL`.
- **"Couldn't read the receipt":** try a flatter, brighter photo, or tap "Type it in instead". Any item can be edited on the review screen.
- **Peer dependency errors on install:** use `npm install --legacy-peer-deps`.

# Setup

This gets Tabby running on your computer and deployed so phones can reach it. Allow about 30 minutes the first time.

## What you need

- **Node 20 or newer**
- A free **Supabase** project (the database)
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)
- Optionally, an **ElevenLabs API key** for voice (speech to text and read-aloud)
- Optionally, the **Phantom** wallet, to try paying with a real wallet

## 1. Install

```bash
git clone https://github.com/jellyfishing2346/hackknight.git
cd hackknight
npm install --legacy-peer-deps
cp .env.example .env.local
```

The `--legacy-peer-deps` flag is needed because of overlapping version requirements in the Solana libraries. The repo's `.npmrc` sets it for deployments too.

## 2. Environment variables

Fill these in `.env.local`. On Vercel, add the same names under **Settings → Environment Variables**.

| Variable | Required | What it is |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | From Google AI Studio. Powers receipt scanning, Tabby AI, and guest matching. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.8-flash`. Change it to switch models without touching code. |
| `SUPABASE_URL` | Yes | Supabase → Project Settings → API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same page. Server-only: never put it in browser code or share it. |
| `SOLANA_RPC_URL` | No | Defaults to the public devnet endpoint. A free Helius devnet URL is faster and less rate-limited. |
| `MERCHANT_WALLET` | Yes | The wallet that receives repayments when a host uses the demo account (a Phantom devnet address). |
| `SPLIT_TOKEN_MINT` | Yes | The test token's address. Printed by `npm run devnet init`. |
| `ADMIN_SECRET_KEY` | For one-tap pay | The admin wallet's secret, from `npm run devnet export-admin`. Never share it. |
| `ELEVENLABS_API_KEY` | For voice | From ElevenLabs → Developers → API Keys. The key needs both **Text to Speech** and **Speech to Text** access. |
| `ELEVENLABS_VOICE_ID` | No | A voice from your ElevenLabs Voices page. Defaults to a built-in voice. |
| `ELEVENLABS_STT_MODEL` | No | Speech-to-text model. Defaults to `scribe_v2`. |

## 3. Create the database

In Supabase, open **SQL Editor → New query** and run each of these files, in order:

1. `supabase/schema.sql`
2. `supabase/migrations/002_host.sql` (adds the host's name, wallet, and secret token to each bill)
3. `supabase/migrations/003_shared_items.sql` (lets several people share an item, adds even splits, and adds the atomic `claim_item` function)

Each migration is safe to run more than once.

## 4. Create the test money

Tabby uses a test token on Solana devnet with 6 decimal places, standing in for USDC. One command creates it:

```bash
npm run devnet init
```

This creates an admin wallet (saved to `.devnet-admin.json`, which is git-ignored), requests devnet SOL for it, and creates the token. Copy the printed `SPLIT_TOKEN_MINT=` line into `.env.local`.

If the devnet faucet is rate-limited, paste the printed admin address into [faucet.solana.com](https://faucet.solana.com) and run the command again.

For one-tap payments, export the admin key and add it as `ADMIN_SECRET_KEY`:

```bash
npm run devnet export-admin
```

Other commands:

```bash
npm run devnet fund <wallet address> 200   # give a wallet 200 test tokens
npm run devnet balance <wallet address>    # check a wallet's test tokens
```

## 5. Run it

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000) and choose **See an example bill** to try the whole flow without a photo.

## 6. Deploy so phones can join

`localhost` only works on your own computer, and friends need to scan a QR code from their phones, so deploy early:

1. Import the GitHub repo into [Vercel](https://vercel.com).
2. Add every environment variable from step 2.
3. Deploy. Every push to `main` redeploys automatically.

After changing an environment variable on Vercel, **redeploy** for it to take effect (Deployments → ⋯ → Redeploy).

Vercel also provides HTTPS, which phones require for the camera and microphone.

## Demo wallets (optional)

The default one-tap payment needs no wallet at all. To demo **Pay with Phantom** as well:

1. Install Phantom on a phone, create a wallet, and switch it to devnet (Settings → Developer Settings → Testnet Mode → Solana Devnet).
2. Fund it: `npm run devnet fund <phone's wallet address> 200`
3. Check it: `npm run devnet balance <phone's wallet address>`

If "Open in wallet" doesn't launch Phantom from the phone's browser, open the guest link inside Phantom's built-in browser instead.

## Troubleshooting

**"Tabby's AI is busy right now."**
Gemini is out of quota or overloaded. Free Gemini API keys have a small daily request limit per model, which a weekend of testing can use up. Fixes, best first: set up billing on the key's Google Cloud project in AI Studio (Google offers developer credits, so this needn't cost anything); switch `GEMINI_MODEL` to a model with a higher free limit (check AI Studio → Rate Limit); or use a key from a different Google Cloud project. Meanwhile, typing items in and tapping items always work.

**AI Studio says the billing account "has the maximum number of projects."**
Unlink a project you no longer use from that billing account (Google Cloud Console → Billing → Account management → the project's ⋯ menu → Disable billing), then try again.

**"Couldn't transcribe that (error 401)."**
The ElevenLabs key doesn't have Speech to Text access. Edit the key in ElevenLabs → Developers → API Keys and give it access to both Text to Speech and Speech to Text.

**"You're going a little fast."**
A rate limit. Wait a minute. Limits are per visitor, per minute, so normal use never hits them.

**A payment went through but the bill still says unpaid.**
The bill checks Solana every two seconds; give it a moment. If it never updates, check the RPC: a Helius devnet URL in `SOLANA_RPC_URL` is more reliable than the public endpoint.

**"The admin wallet is out of devnet SOL."**
One-tap payments use the admin wallet to pay fees. Send it devnet SOL from [faucet.solana.com](https://faucet.solana.com).

**"bigint: Failed to load bindings, pure JS will be used."**
Harmless. A Solana library falls back to plain JavaScript.

**Peer dependency errors during install.**
Use `npm install --legacy-peer-deps`.

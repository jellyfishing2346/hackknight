# Demo guide

Everything the team needs to present Tabby: the pitch, what to check beforehand, what to do when something breaks, and answers to the questions judges tend to ask.

## The two-minute demo

Roles: one person talks, one drives the laptop (the host), and one or two judges or teammates use phones (the guests).

**1. The hook (15 seconds).**
> "Raise your hand if you've ever paid for a group dinner and then spent a week chasing people for money. Splitting a bill is a tiny payment problem that happens all the time, and it's still awkward. Tabby fixes it."

**2. Create the bill by voice (20 seconds).** On the laptop, tap **🎤 Just say it** and speak:
> "Dinner at Luigi's, two pizzas at 18 each, wings for 12, 8% tax, 20% tip. I'm Sam and I paid."

The receipt appears. Point out that Gemini understood the quantities and the percentages, and that the code (not the AI) computed the tax and tip. Tap **Use this bill**, keep **By what each person got**, and share.

*(If you have a good paper receipt, the photo route works too: **📷 Snap the receipt**, then point out the ✓ "Matches the receipt's total" check.)*

**3. A friend joins (25 seconds).** Hand a judge a phone. They scan the QR code, type a name, then tap **🎤 Tell Tabby what you had** and say:
> "I had a pizza and some of the wings."

Tabby lists the items to confirm. They tap **Yes, mark these as mine**. On the laptop, their items fill in.

**4. They pay (20 seconds).** The judge taps **Pay Sam back**. In about a second, the Paid stamp lands on the laptop and the laptop says it out loud.
> "That's a real transaction on Solana: about a second, a fraction of a cent, and no app or account needed."

**5. The proof (15 seconds).** Tap **See proof of payment ↗**. On Solana Explorer, show the transfer and the memo: *"Tabby: [name] paid Sam back · Luigi's."*
> "Anyone can verify this. 'Paid' in Tabby means the blockchain says so, not a checkbox in our database."

**6. Follow-up and close (25 seconds).** Tap **Remind** next to someone who hasn't paid and show the Text / WhatsApp / Email options and the voice note. Then:
> "Snap it or say it, everyone pays their exact share in a second, and nobody has to chase anyone. That's Tabby."

## Before the demo: checklist

**The night before**
- [ ] Gemini billing is active (AI Studio shows a paid tier, not "Free tier"). The free tier allows only a few requests per day.
- [ ] Every environment variable on Vercel matches `.env.local`, and the latest deploy is **Ready**.
- [ ] The admin wallet has devnet SOL: `npm run devnet balance <admin address>`. Top it up at faucet.solana.com if it's under 1 SOL.
- [ ] Record the backup video (below).

**30 minutes before**
- [ ] Run the full demo once on the real devices, on the venue Wi-Fi.
- [ ] Phones: open hackknight.vercel.app once in the browser and allow the microphone, so permission prompts don't appear mid-demo.
- [ ] Laptop: volume up, and tap the page once after opening the live bill, so read-aloud is allowed.
- [ ] Laptop: close other tabs, turn on Do Not Disturb, and zoom the browser to 125% so judges can read it.
- [ ] Have the voice prompt written on a sticky note.
- [ ] Charge everything.

## When something breaks

| Problem | What to do |
| --- | --- |
| "Tabby's AI is busy right now" | Say "our AI quota ran out, so here's the manual path," tap **✏️ Type it in** or **See an example bill**, and keep going. Payments don't use the AI. |
| The mic doesn't work | Type the same sentence into Tabby AI. |
| The venue Wi-Fi is slow | Switch the laptop and phones to a phone hotspot. |
| A payment is slow to show as paid | Keep talking for a few seconds; the bill checks Solana every two seconds. If devnet is down, play the backup video. |
| Read-aloud is silent | Tap anywhere on the page once (browsers block sound until a tap), and check the volume. |
| Everything is down | Play the backup video and walk through the code and docs. |

### Recording the backup video

Record a 90-second screen capture of the whole flow working, with sound on, showing the laptop and a phone (use QuickTime's iPhone screen mirroring, or film the phone). Keep it on the laptop's desktop and on a teammate's phone.

## Questions judges often ask

**"Why use crypto instead of existing payment apps?"**
Shared bills are small, frequent payments between friends, often using different apps. Solana settles in about a second for a fraction of a cent, works the same for everyone with no app to install, and gives a public receipt anyone can check. That last part removes the "did you get my payment?" back-and-forth. And because each payment is verified on-chain, Tabby never has to trust what a browser tells it.

**"Is this real money?"**
Not yet. It runs on Solana devnet with a test token that stands in for USDC. Moving to mainnet USDC uses the same code path; the main additions are real wallets (or a card on-ramp) and a cash-out option.

**"What stops someone from lying about who they are or what they had?"**
The host sees every claim live on their screen. Names are checked (nobody can take the host's name, and duplicate names get an "Is that you?"), shares are locked once money moves, and the host can take on items themselves or cover anything left unclaimed. For a table of friends, visible and correctable beats heavy identity checks.

**"What if the AI reads the receipt wrong?"**
Three safeguards: the host reviews and can edit every line before sharing; Tabby compares what it read against the printed total and warns about any mismatch; and the AI never does the money math. It reports items and percentages, and our code computes every dollar.

**"How does the split handle tax and tip?"**
In proportion to what each person had, and shared dishes divide between whoever had them. The host absorbs any rounding cent, so the shares always add up to the receipt exactly. See [How the split is calculated](SPLIT_MATH.md) for a worked example.

**"How does ElevenLabs fit in?"**
Voice in and voice out. Scribe turns speech into text for creating bills and claiming items, in any language. Text to speech reads payments aloud on the live bill and records reminder voice notes. The server writes every spoken sentence from real bill data, so it can't be made to say anything else.

**"What was the hardest part?"**
Making the money math exactly right in every case (shared items, proportional tax and tip, leftovers, rounding, people paying while others are still choosing) and making sure nobody's share can change after they've paid.

**"What would you build next?"**
Mainnet USDC with a bank cash-out, automatic reminders by text or email, running balances across many tabs with the same friends, and support for more than one person paying.

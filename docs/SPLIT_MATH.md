# How the split is calculated

Getting the numbers exactly right is the whole point of Tabby, so every amount anywhere in the app comes from one place: `split()` in `lib/split.ts`. It's a pure function (no database or network access), and the guest's screen, the host's screen, and the payment request all call it. The number a guest sees is the number they're charged.

## The rules

**1. Everyone pays for what they had.** Each item belongs to whoever claimed it.

**2. Shared items divide evenly.** If two people claim the chips and guac, each owes half its price. Three people, a third each.

**3. Tax and tip are shared in proportion to what you had.** If your items are 40% of the food, you pay 40% of the tax and 40% of the tip. This is how most people would split it by hand, and it means nobody subsidizes someone else's expensive order.

**4. The host pays too.** The host's own items, and their proportional tax and tip, are their share of the bill. They already paid it at the restaurant, so they owe nothing back; everyone else's shares are what they collect.

**5. Leftovers are the host's call.** Items nobody claims stay unassigned (and the bill can't be marked settled) until the host decides:
- **I'll cover them:** they become part of the host's share.
- **Split them evenly:** their cost divides equally between everyone on the bill, host included, and tax and tip follow proportionally as usual.

**6. Rounding never loses or invents a cent.** Each guest's amount is rounded to the cent. The host absorbs whatever rounding is left over, so the host's share plus everyone's repayments always add up to the receipt total exactly.

## A worked example

Sam pays for dinner at Taqueria El Sol for three people. These numbers come straight from running the app's `split()` function on this bill.

| Item | Price | Who had it |
| --- | ---: | --- |
| Chicken tacos | $14.50 | Sam |
| Carne asada burrito | $16.00 | Ana |
| Chips & guac | $9.25 | Ana and Leo (shared) |
| Horchata | $4.50 | Leo |
| **Food** | **$44.25** | |
| Tax | $4.33 | |
| Tip | $9.80 | |
| **Total** | **$58.38** | |

**Step 1, each person's food.** The chips and guac split two ways, $4.625 each.

| Person | Food |
| --- | ---: |
| Sam | $14.50 |
| Ana | $16.00 + $4.625 = $20.625 |
| Leo | $4.625 + $4.50 = $9.125 |

**Step 2, tax and tip in proportion.** Tax plus tip is $14.13. Each person pays (their food ÷ $44.25) × $14.13.

| Person | Share of food | Tax and tip | Total share |
| --- | ---: | ---: | ---: |
| Sam (host) | 32.8% | $4.63 | $19.13 (already paid) |
| Ana | 46.6% | $6.59 | **$27.21** |
| Leo | 20.6% | $2.91 | **$12.04** |

**Step 3, check it adds up.** Ana and Leo send Sam $27.21 + $12.04 = $39.25. Add Sam's own $19.13 and you get **$58.38**, exactly the receipt total.

### The same bill, split evenly

If Sam chooses **Split evenly** between 4 people instead, each share is $58.38 ÷ 4 = $14.595, which rounds to **$14.60**. The three guests send $43.80 in total, and Sam's own share is the remaining **$14.58**. The rounding half-cent lands on Sam rather than being charged to a guest, and the totals still match the receipt.

## Details that matter

- **Payments are capped at what's owed.** Progress counts each guest's payment only up to their share, so an accidental overpayment can't make the bill look settled while someone else still owes.
- **Shares are locked once paid.** After you pay, your items can't be released (or you could pay, unclaim a shared dish, and push its cost onto someone else), and nobody can join an item you've paid for (which would leave you overcharged). The host also can't change the split or the leftover choice once money has moved.
- **Even splits know how many shares remain.** Once every guest share is paid, nobody else can pay, even if a new person scans the QR code.
- **"Settled" is strict.** A bill is settled only when every item is assigned (claimed, covered, or split) and every guest has paid their full share, as verified on Solana.

## Where the AI fits in

The AI never does money math that matters. When Tabby AI hears "8% tax and a 20% tip," it reports those as percentages and `lib/assistant.ts` computes the dollars from the subtotal. When it hears "two pizzas at 18 each," it reports a quantity, and the code creates two separate $18.00 lines (if a total doesn't divide evenly, such as three tacos for $10, the lines are $3.33, $3.33, and $3.34). From there, everything flows through the same `split()` function as a scanned or typed receipt.

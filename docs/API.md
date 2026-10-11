# API reference

All endpoints are Next.js route handlers under `app/api/`. They take and return JSON (except where noted). Errors always come back as `{ "error": "A sentence a person can read." }` with a matching HTTP status, and the screens show that sentence as-is, so every error message is written for the person using the app.

Endpoints that cost money or shared resources are **rate-limited per visitor, per minute** (see the last column). Going over returns `429` with a "You're going a little fast" message and a `Retry-After` header.

## Creating a bill

| Method and path | Body | Returns | Limit |
| --- | --- | --- | --- |
| `POST /api/parse` | `{ image, mimeType }` (base64 photo) | `{ merchant, items: [{ name, price }], tax, tip, printedTotal? }` | 8 / min |
| `POST /api/assistant` | `{ messages: [{ role, text }] }` (the Tabby AI conversation) | `{ reply, draft }` where `draft` is a ready bill or `null` | 15 / min |
| `POST /api/transcribe` | form data with `file` (a voice recording) | `{ text }` | 12 / min |
| `POST /api/bills` | `{ title, tax, tip, items, hostName, hostWallet?, evenSplit? }` | `{ id, hostToken }` | 10 / min |

`/api/parse` and `/api/assistant` respond `503` with a friendly "Tabby's AI is busy" message when Gemini is out of quota or overloaded. The client keeps the manual options available.

`hostToken` is the secret that unlocks host controls. The host's browser stores it; it's never shown to guests.

## Reading and running a bill

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /api/bills/[id]` | | `{ bill, items, payments }`. Also checks Solana for any pending payments and marks verified ones paid. |
| `POST /api/bills/[id]/host` | `{ token, action, itemId?, count? }` | `{ ok: true }`. Requires the host token. Screens pick up the change on their next refresh. |
| `POST /api/items/[id]/claim` | `{ name, claim }` | `{ ok: true }`. Adds or removes this person as a claimer of the item. |

Host actions (`action`):

| Action | What it does |
| --- | --- |
| `claim-item` / `release-item` | Mark an item as the host's own, or undo that |
| `cover-rest` | The host takes on every unclaimed item |
| `split-rest` / `unsplit` | Split unclaimed items evenly between everyone, or undo that |
| `set-even` | Split the whole bill evenly `count` ways (2 to 50) |

**Changes are locked once money has moved.** After anyone has paid, the even split and the leftover choice can't be changed, and the host can't take or release an item that a paying guest is sharing. Otherwise a change could leave someone who already paid overcharged or undercharged.

Claim rules, enforced by the server:

- The host's name can't be used to claim items, and items can't be claimed on an evenly split bill.
- Once you've paid, your items are locked, so your total can't drop below what you sent.
- You can't join an item that someone else has already paid their share of, because sharing it would lower their share after the fact and leave them overcharged.

## Guest help

| Method and path | Body | Returns | Limit |
| --- | --- | --- | --- |
| `POST /api/bills/[id]/assist` | `{ name, text }` ("I had the burrito and half the guac") | `{ reply, matches: [{ id, name, price, alreadyMine, sharedWith }] }` | 12 / min |

Matches only ever contain items from this bill. Nothing is claimed by this call; the guest confirms, then the app calls the claim endpoint for each item.

## Paying

All three start by working out what the person still owes and creating (or reusing) a pending payment with a unique Solana Pay reference.

| Method and path | Body | Returns | Limit |
| --- | --- | --- | --- |
| `POST /api/bills/[id]/instant` | `{ name }` | `{ signature }`. One tap, no wallet: the server sends the payment. | 6 / min |
| `POST /api/bills/[id]/tx` | `{ name, account }` (the guest's wallet address) | `{ transaction, amount }`. An unsigned transaction for the wallet to sign. | |
| `POST /api/send` | `{ transaction }` (signed, base64) | `{ signature }`. Submits a wallet-signed transaction. | |
| `POST /api/bills/[id]/pay` | `{ name }` | `{ payment, url }`. A Solana Pay `solana:` URL for any compatible wallet. | |

Every payment transaction includes an on-chain memo (`Tabby: Ana paid Sam back · Weekend ski trip`) just before the transfer. A payment only counts once `GET /api/bills/[id]` has verified it on-chain.

## Voice

| Method and path | Body | Returns | Limit |
| --- | --- | --- | --- |
| `POST /api/announce` | `{ billId, kind, name? }` | An MP3 (`audio/mpeg`) | 25 / min |

`kind` is one of:

| Kind | Says | Requires |
| --- | --- | --- |
| `test` | "Announcements are on…" | |
| `paid` | "Ana just paid Sam back 27 dollars and 21 cents." | `name` has fully paid |
| `settled` | "That's everyone. Sam is all square." | the bill is settled |
| `reminder` | "Hey Ana! Friendly reminder from Sam. Your share of … is …" | `name` still owes something |

The server writes every sentence from the bill's real data; a request can only choose which event to announce. Identical sentences are cached so repeats don't spend credits.

"""Read-only sanity check: prove check_payment() against a real Solana transaction.

Pulls a couple of `paid` rows out of the payments table and re-runs check_payment
on them. It should find the same signature that's already stored on the row.

Never prints env values or the Supabase key. Only prints public data: row ids,
reference/recipient addresses, amounts, and signatures (all of which are public
on-chain or are IDs meant to be shared with the payer).

Usage:
    python -m backend.try_payments
"""
import os
import sys
from decimal import Decimal

from supabase import create_client

from backend.services.solana_pay import check_payment

LIMIT = 2


def main():
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    recipient = os.environ.get("MERCHANT_WALLET")
    mint = os.environ.get("SPLIT_TOKEN_MINT")

    missing = [
        name
        for name, value in [
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", supabase_key),
            ("MERCHANT_WALLET", recipient),
            ("SPLIT_TOKEN_MINT", mint),
        ]
        if not value
    ]
    if missing:
        print(f"Missing env vars: {', '.join(missing)}. Check .env.local.")
        sys.exit(1)

    client = create_client(supabase_url, supabase_key)
    rows = (
        client.table("payments")
        .select("id, bill_id, payer_name, amount, reference, signature, created_at")
        .eq("status", "paid")
        .order("created_at", desc=True)
        .limit(LIMIT)
        .execute()
        .data
    )

    if not rows:
        print("No rows with status='paid' found. Nothing to check against yet.")
        return

    print(f"Checking against recipient={recipient} mint={mint}\n")

    any_mismatch = False
    for row in rows:
        amount = Decimal(str(row["amount"]))
        signature = check_payment(row["reference"], amount, recipient, mint)

        stored = row.get("signature")
        match = "MATCH" if signature == stored else "MISMATCH"
        if signature != stored:
            any_mismatch = True

        print(f"payment {row['id']} ({row['payer_name']}, amount={amount})")
        print(f"  reference      = {row['reference']}")
        print(f"  stored sig     = {stored}")
        print(f"  check_payment  = {signature}")
        print(f"  {match}\n")

    if any_mismatch:
        print("At least one row did not match. See notes in CLAUDE.md section 7 step 2:")
        print("work out whether it's a wallet/token mismatch with the current .env.local, or a real bug.")
        sys.exit(1)

    print("All checked rows matched their stored signature.")


if __name__ == "__main__":
    main()

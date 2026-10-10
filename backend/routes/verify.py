import os
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request
from solders.pubkey import Pubkey

from backend.services.solana_pay import check_payment

bp = Blueprint("verify", __name__)

MAX_AMOUNT = Decimal("100000")


def _valid_address(value) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        Pubkey.from_string(value)
        return True
    except ValueError:
        return False


def _valid_amount(value):
    """Returns a Decimal if value is a finite number in (0, MAX_AMOUNT], else None."""
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite() or amount <= 0 or amount > MAX_AMOUNT:
        return None
    return amount


@bp.post("/api/verify")
def verify():
    configured_key = os.environ.get("VERIFY_API_KEY")
    if not configured_key:
        current_app.logger.error("VERIFY_API_KEY is not configured on the server.")
        return jsonify({"error": "Server misconfigured."}), 500

    if request.headers.get("X-Api-Key") != configured_key:
        return jsonify({"error": "Unauthorized."}), 401

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400

    reference = body.get("reference")
    recipient = body.get("recipient")

    if not _valid_address(reference) or not _valid_address(recipient):
        return jsonify({"error": "Invalid reference or recipient address."}), 400

    amount = _valid_amount(body.get("amount"))
    if amount is None:
        return jsonify({"error": "Invalid amount."}), 400

    mint = os.environ.get("SPLIT_TOKEN_MINT")
    if not mint:
        current_app.logger.error("SPLIT_TOKEN_MINT is not configured on the server.")
        return jsonify({"error": "Server misconfigured."}), 500

    try:
        signature = check_payment(reference, amount, recipient, mint)
    except Exception:
        current_app.logger.exception(
            "check_payment failed for reference=%s recipient=%s", reference, recipient
        )
        return jsonify({"error": "Could not reach the blockchain. Try again."}), 502

    return jsonify({"paid": signature is not None, "signature": signature})

from decimal import Decimal
from urllib.parse import urlparse, parse_qs
from backend.services.solana_pay import new_reference, payment_url

RECIPIENT = "11111111111111111111111111111111"
MINT = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

def test_new_reference_is_unique_and_looks_like_an_address():
    a, b = new_reference(), new_reference()
    assert a != b
    assert 32 <= len(a) <= 44

def test_payment_url_has_every_field():
    ref = new_reference()
    url = payment_url(RECIPIENT, MINT, Decimal("12.50"), ref, message="Sam's share")
    assert url.startswith(f"solana:{RECIPIENT}?")
    q = parse_qs(urlparse(url).query)
    assert Decimal(q["amount"][0]) == Decimal("12.50")
    assert q["spl-token"] == [MINT]
    assert q["reference"] == [ref]
    assert q["message"] == ["Sam's share"]
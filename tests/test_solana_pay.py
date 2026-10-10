from decimal import Decimal
from urllib.parse import urlparse, parse_qs
from backend.services.solana_pay import new_reference, payment_url
from unittest.mock import patch, Mock
import pytest
from backend.services.solana_pay import find_signature, rpc_call
from backend.services.solana_pay import tokens_received

OTHER = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
OTHER_MINT = "So11111111111111111111111111111111111111112"

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



def test_find_signature_returns_none_when_nothing_found():
    with patch("backend.services.solana_pay.rpc_call", return_value=[]):
        assert find_signature("someref") is None

def test_find_signature_returns_signature_when_found():
    with patch("backend.services.solana_pay.rpc_call", return_value=[{"signature": "abc"}]):
        assert find_signature("someref") == "abc"

def test_rpc_call_raises_on_error_response():
    fake = Mock()
    fake.json.return_value = {"error": {"code": -32005, "message": "rate limited"}}
    with patch("backend.services.solana_pay.requests.post", return_value=fake):
        with pytest.raises(RuntimeError):
            rpc_call("getSignaturesForAddress", ["x"])    



def bal(owner, mint, amount):
    return {"accountIndex": 2, "owner": owner, "mint": mint,
            "uiTokenAmount": {"amount": str(amount), "decimals": 6}}

def make_tx(pre, post):
    return {"meta": {"err": None, "preTokenBalances": pre, "postTokenBalances": post}}

def test_tokens_received_counts_the_increase():
    tx = make_tx([bal(RECIPIENT, MINT, 1_000_000)], [bal(RECIPIENT, MINT, 13_500_000)])
    assert tokens_received(tx, RECIPIENT, MINT) == 12_500_000

def test_missing_pre_balance_counts_as_zero():
    tx = make_tx([], [bal(RECIPIENT, MINT, 5_000_000)])
    assert tokens_received(tx, RECIPIENT, MINT) == 5_000_000

def test_other_mint_is_ignored():
    tx = make_tx([], [bal(RECIPIENT, OTHER_MINT, 5_000_000)])
    assert tokens_received(tx, RECIPIENT, MINT) == 0

def test_other_owner_is_ignored():
    tx = make_tx([], [bal(OTHER, MINT, 5_000_000)])
    assert tokens_received(tx, RECIPIENT, MINT) == 0
import os

import pytest

os.environ["VERIFY_API_KEY"] = "test-key"
os.environ["SPLIT_TOKEN_MINT"] = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

from backend.app import create_app  # noqa: E402  (env vars must be set first)

RECIPIENT = "11111111111111111111111111111111"
REFERENCE = "So11111111111111111111111111111111111111112"
HEADERS = {"X-Api-Key": "test-key"}


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_missing_api_key_is_401(client):
    resp = client.post("/api/verify", json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": 1})
    assert resp.status_code == 401


def test_wrong_api_key_is_401(client):
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": 1},
        headers={"X-Api-Key": "nope"},
    )
    assert resp.status_code == 401


def test_no_configured_key_is_500(client, monkeypatch):
    monkeypatch.delenv("VERIFY_API_KEY", raising=False)
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 500


def test_invalid_json_is_400(client):
    resp = client.post("/api/verify", data="not json", headers=HEADERS, content_type="application/json")
    assert resp.status_code == 400


@pytest.mark.parametrize("bad_recipient", ["", "not-an-address", None, 123])
def test_invalid_recipient_is_400(client, bad_recipient):
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": bad_recipient, "amount": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 400


@pytest.mark.parametrize("bad_reference", ["", "not-an-address", None])
def test_invalid_reference_is_400(client, bad_reference):
    resp = client.post(
        "/api/verify",
        json={"reference": bad_reference, "recipient": RECIPIENT, "amount": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 400


@pytest.mark.parametrize("bad_amount", [0, -5, 100001, "abc", None, float("nan"), float("inf")])
def test_invalid_amount_is_400(client, bad_amount):
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": bad_amount},
        headers=HEADERS,
    )
    assert resp.status_code == 400


def test_valid_request_returns_unpaid_when_no_signature(client, monkeypatch):
    monkeypatch.setattr("backend.routes.verify.check_payment", lambda *a, **k: None)
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"paid": False, "signature": None}


def test_valid_request_returns_paid_with_signature(client, monkeypatch):
    monkeypatch.setattr("backend.routes.verify.check_payment", lambda *a, **k: "abc123")
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"paid": True, "signature": "abc123"}


def test_blockchain_failure_is_502(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("rpc exploded")

    monkeypatch.setattr("backend.routes.verify.check_payment", boom)
    resp = client.post(
        "/api/verify",
        json={"reference": REFERENCE, "recipient": RECIPIENT, "amount": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 502
    assert "rpc exploded" not in resp.get_data(as_text=True)


def test_health_endpoint(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}

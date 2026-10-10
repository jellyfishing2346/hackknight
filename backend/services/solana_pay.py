from decimal import Decimal
from urllib.parse import quote
from solders.keypair import Keypair
import base58
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")


def generate_keypair_string() -> str:
    """Generates a new Solana keypair and returns it as a base58 string."""
    keypair = Keypair()
    return base58.b58encode(bytes(keypair)).decode('utf-8')

def keypair_from_string(key_string: str) -> Keypair:
    """Restores a Solders Keypair object from a base58 string."""
    return Keypair.from_base58_string(key_string)



def new_reference() -> str:
    """Generates a new, unique base58-encoded public key to use as a Solana Pay reference."""
    return str(Keypair().pubkey())


def payment_url(recipient, mint, amount, reference, message="", label="Tabby") -> str:
    amt = format(Decimal(str(amount)).normalize(), "f")
    params = [
        f"amount={amt}",
        f"spl-token={mint}",
        f"reference={reference}",
        f"label={quote(label)}",
    ]
    if message:
        params.append(f"message={quote(message)}")
    return f"solana:{recipient}?" + "&".join(params)

def rpc_call(method, params):
    url = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    resp = requests.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"Solana RPC error: {data['error']}")
    return data["result"]

def find_signature(reference):
    # TODO 1: call rpc_call with the method "getSignaturesForAddress"
    #         and params [reference, {"commitment": "confirmed", "limit": 1}]
    # TODO 2: if the result is an empty list, return None
    # TODO 3: otherwise return the "signature" of the first item in the list

    signatures = rpc_call("getSignaturesForAddress", [reference, {"commitment": "confirmed", "limit": 1}])
    if not signatures:
        return None
    return signatures[0]["signature"]

def tokens_received(tx, recipient, mint):
    meta = tx["meta"]

    def sum_balances(balances):
        total = 0
        for entry in balances:
            if entry["owner"] == recipient and entry["mint"] == mint:
                total += int(entry["uiTokenAmount"]["amount"])
        return total

    post = sum_balances(meta["postTokenBalances"])
    pre = sum_balances(meta.get("preTokenBalances", []))
    return post - pre


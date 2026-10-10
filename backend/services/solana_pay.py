from decimal import Decimal
from urllib.parse import quote
from solders.keypair import Keypair
import base58



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

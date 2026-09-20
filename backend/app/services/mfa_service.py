import base64
import io
import logging

import pyotp
import qrcode

from app.core.encryption import encrypt, decrypt

logger = logging.getLogger(__name__)


class TotpSecretUnreadable(Exception):
    """The stored TOTP secret will not decrypt under the current key."""


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, username: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name="DocuVault")


def generate_qr_data_url(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def verify_totp_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def encrypt_secret(secret: str) -> str:
    encrypted_bytes = encrypt(secret)
    return base64.b64encode(encrypted_bytes).decode("utf-8")


def decrypt_secret(encrypted: str) -> str:
    """The stored TOTP secret.

    The failure this names is a real one that happened on 2026-09-20:
    ENCRYPTION_KEY was rotated and this column was not re-encrypted with it,
    so every second-factor check raised a bare `InvalidTag` from deep inside
    the crypto library and returned a 500. The column is read only at the
    moment somebody types a code, so nothing surfaced it until a person was
    locked out. Say what went wrong instead, and say what fixes it.
    """
    try:
        return decrypt(base64.b64decode(encrypted))
    except Exception as exc:
        logger.error(
            "Stored TOTP secret will not decrypt. This is what a rotated "
            "ENCRYPTION_KEY without a re-key looks like - run "
            "scripts/rekey_encrypted.py with OLD_ENCRYPTION_KEY set.")
        raise TotpSecretUnreadable(
            "This account's second factor cannot be read on the server. "
            "An administrator needs to re-key or re-enrol it."
        ) from exc

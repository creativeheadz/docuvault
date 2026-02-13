import base64
import io

import pyotp
import qrcode

from app.core.encryption import encrypt, decrypt


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
    encrypted_bytes = base64.b64decode(encrypted)
    return decrypt(encrypted_bytes)

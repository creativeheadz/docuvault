"""Re-encrypt every AES-GCM field under a new ENCRYPTION_KEY.

Rotating ENCRYPTION_KEY makes every existing ciphertext undecryptable, so
the rotation and the re-encryption have to happen together. On 2026-09-20
they did not: the key was rotated and only `app_settings` was re-encrypted,
which left `users.totp_secret` encrypted under a key that no longer existed.
Nothing noticed until somebody typed a TOTP code and got a 500, because that
column is only read at the moment of a second-factor check.

The lesson is that "which columns are encrypted" must not be something each
rotation rediscovers by grepping. This script is the list, it is the only
supported way to rotate, and a new encrypted column is expected to be added
to ENCRYPTED_FIELDS in the same commit that introduces it.

Usage, from inside the backend container, with the NEW key already in the
environment and the OLD one passed in:

    OLD_ENCRYPTION_KEY=<previous> python scripts/rekey_encrypted.py --dry-run
    OLD_ENCRYPTION_KEY=<previous> python scripts/rekey_encrypted.py

Idempotent: a value that already decrypts under the new key is left alone,
so an interrupted run can simply be repeated.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import copy
import os
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings                      # noqa: E402
from app.core.database import async_session          # noqa: E402
from app.models.app_settings import AppSettings      # noqa: E402
from app.models.password import Password             # noqa: E402
from app.models.user import User                     # noqa: E402


# (model, column, encoding). "raw" is bytes straight in the column; "b64" is
# base64 text; "json" means walk a JSON blob and re-encrypt anything that
# decrypts, which is how app_settings stores provider credentials.
ENCRYPTED_FIELDS = [
    (User, "totp_secret", "b64"),          # mfa_service.encrypt_secret
    (Password, "password_encrypted", "raw"),  # api/v1/passwords.py
    (AppSettings, "value", "json"),        # registrars, uptime, meshcentral
]


def _key(raw: str) -> bytes:
    return base64.b64decode(raw)


def _decrypt(key: bytes, blob: bytes) -> str:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None).decode("utf-8")


def _encrypt(key: bytes, text: str) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, text.encode("utf-8"), None)


def _try(key: bytes, value, encoding: str) -> str | None:
    """The plaintext, if `value` decrypts under `key`. None otherwise."""
    try:
        blob = value if encoding == "raw" else base64.b64decode(value, validate=True)
        if not isinstance(blob, (bytes, bytearray)) or len(blob) < 29:
            return None
        return _decrypt(key, bytes(blob))
    except Exception:
        return None


def _wrap(key: bytes, text: str, encoding: str):
    blob = _encrypt(key, text)
    return blob if encoding == "raw" else base64.b64encode(blob).decode("ascii")


def _rekey_json(node, old: bytes, new: bytes, report: list[str], path: str):
    if isinstance(node, dict):
        return {k: _rekey_json(v, old, new, report, f"{path}.{k}") for k, v in node.items()}
    if isinstance(node, list):
        return [_rekey_json(v, old, new, report, path) for v in node]
    if isinstance(node, str):
        if _try(new, node, "b64") is not None:
            return node                       # already re-encrypted
        plain = _try(old, node, "b64")
        if plain is not None:
            report.append(path)
            return _wrap(new, plain, "b64")
    return node


async def main(dry_run: bool) -> int:
    old_raw = os.environ.get("OLD_ENCRYPTION_KEY")
    if not old_raw:
        print("OLD_ENCRYPTION_KEY is not set", file=sys.stderr)
        return 2
    old, new = _key(old_raw), _key(settings.ENCRYPTION_KEY)
    if old == new:
        print("OLD_ENCRYPTION_KEY and ENCRYPTION_KEY are the same - nothing to do")
        return 0

    moved, already, stuck = [], 0, []
    async with async_session() as db:
        for model, column, encoding in ENCRYPTED_FIELDS:
            rows = (await db.execute(select(model))).scalars().all()
            for row in rows:
                value = getattr(row, column)
                if value in (None, "", b""):
                    continue
                label = f"{model.__tablename__}.{column}[{row.id}]"

                if encoding == "json":
                    report: list[str] = []
                    updated = _rekey_json(copy.deepcopy(value), old, new, report, column)
                    if report:
                        moved.extend(f"{label} {p}" for p in report)
                        if not dry_run:
                            setattr(row, column, updated)
                            flag_modified(row, column)
                    continue

                if _try(new, value, encoding) is not None:
                    already += 1
                    continue
                plain = _try(old, value, encoding)
                if plain is None:
                    stuck.append(label)
                    continue
                moved.append(label)
                if not dry_run:
                    setattr(row, column, _wrap(new, plain, encoding))

        if dry_run:
            await db.rollback()
        else:
            await db.commit()

    verb = "would re-encrypt" if dry_run else "re-encrypted"
    print(f"{verb}: {len(moved)}")
    for m in moved:
        print(f"  {m}")
    print(f"already under the new key: {already}")
    if stuck:
        print(f"COULD NOT DECRYPT under either key: {len(stuck)}", file=sys.stderr)
        for s in stuck:
            print(f"  {s}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would change and roll back")
    raise SystemExit(asyncio.run(main(ap.parse_args().dry_run)))

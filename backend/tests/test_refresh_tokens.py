"""Refresh token identity and hashing.

The database tests for rotation and reuse need a live Postgres and live it
in the deployment check; these cover the part that is pure, including the
bug that recording tokens uncovered.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import create_refresh_token, decode_token  # noqa: E402
from app.models.refresh_token import hash_refresh_token  # noqa: E402


def test_two_tokens_for_one_user_are_never_identical():
    """`exp` has one-second resolution, so a payload of {sub, exp, type}
    alone made two tokens minted in the same second byte-identical. Harmless
    while nothing stored them; a unique-constraint violation - and so a
    failed login - once they were recorded."""
    sub = {"sub": "06594b4d-bcef-4b95-8a50-7425367d5e5d"}
    tokens = {create_refresh_token(sub) for _ in range(200)}
    assert len(tokens) == 200


def test_the_unique_claim_survives_a_round_trip():
    payload = decode_token(create_refresh_token({"sub": "x"}))
    assert payload["type"] == "refresh"
    assert payload["jti"]


def test_the_stored_hash_is_not_the_token():
    raw = create_refresh_token({"sub": "x"})
    digest = hash_refresh_token(raw)
    assert digest != raw
    assert len(digest) == 64
    assert hash_refresh_token(raw) == digest       # stable
    assert hash_refresh_token(raw + "x") != digest  # and sensitive


def test_an_access_token_is_not_a_refresh_token():
    from app.core.security import create_access_token
    assert decode_token(create_access_token({"sub": "x"}))["type"] == "access"

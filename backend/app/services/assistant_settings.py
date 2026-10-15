"""Which Claude the systems chat talks to, and with what.

Settings live in one ``app_settings`` row keyed ``assistant``::

    {"model": "claude-sonnet-5-5", "api_key": "<base64 ciphertext>",
     "max_output_tokens": 16000, "effort": "medium"}

Every field falls back to the environment (``ANTHROPIC_MODEL``,
``ANTHROPIC_API_KEY``) or a default, so an instance configured the old way
keeps working with nothing saved here. The key is encrypted like every other
provider credential in app_settings, which is also how
scripts/rekey_encrypted.py finds it.
"""
from __future__ import annotations

import base64
import logging
import time
from dataclasses import dataclass
from typing import Any

from anthropic import AsyncAnthropic
import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.encryption import decrypt, encrypt
from app.models.app_settings import AppSettings

logger = logging.getLogger(__name__)

SETTINGS_KEY = "assistant"
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_MAX_OUTPUT = 16000
# Streaming lets a reply be long; the nginx read timeout (300s) is what a
# whole chat turn has to fit inside, so the ceiling stays well short of what
# the models allow.
MAX_OUTPUT_CEILING = 32000
MIN_OUTPUT = 2048
EFFORTS = ("low", "medium", "high")

# What the settings page offers. Prices are USD per million tokens, for the
# page to say what a choice costs; the chat page keeps its own copy for the
# per-turn estimate.
MODELS: list[dict[str, Any]] = [
    {"id": "claude-opus-5-5", "label": "Claude Opus 5.5", "input": 4.0, "output": 20.0,
     "note": "Most capable Opus. Always thinks; effort defaults to medium."},
    {"id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5", "input": 2.0, "output": 10.0,
     "note": "Current Sonnet: fast, capable, half the price of Opus."},
    {"id": "claude-haiku-5-5", "label": "Claude Haiku 5.5", "input": 0.1, "output": 0.5,
     "note": "Current Haiku: cheapest and quickest."},
    {"id": "claude-fable-5-1", "label": "Claude Fable 5.1", "input": 10.0, "output": 50.0,
     "note": "Anthropic's most capable model. Slow and expensive for a chat."},
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6", "input": 3.0, "output": 15.0,
     "note": "What this chat used before it had a setting."},
    {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5", "input": 1.0, "output": 5.0,
     "note": "Previous Haiku. Takes no effort setting."},
]
# Models that refuse an effort setting outright.
_NO_EFFORT = {"claude-haiku-4-5"}


@dataclass
class AssistantConfig:
    model: str
    api_key: str | None
    max_output_tokens: int
    effort: str | None
    key_source: str | None      # "settings" | "environment" | None

    def request_extras(self) -> dict[str, Any]:
        """Parameters that depend on the model, for messages.create/stream."""
        if self.effort and self.model not in _NO_EFFORT:
            return {"output_config": {"effort": self.effort}}
        return {}


async def _row(db: AsyncSession) -> AppSettings | None:
    return (await db.execute(select(AppSettings).where(AppSettings.key == SETTINGS_KEY))).scalar_one_or_none()


def _clamp_output(n) -> int:
    try:
        n = int(n)
    except (TypeError, ValueError):
        return DEFAULT_MAX_OUTPUT
    return max(MIN_OUTPUT, min(MAX_OUTPUT_CEILING, n))


async def resolve(db: AsyncSession) -> AssistantConfig:
    row = await _row(db)
    value = dict(row.value) if row and row.value else {}
    key, source = None, None
    if value.get("api_key"):
        try:
            key, source = decrypt(base64.b64decode(value["api_key"])), "settings"
        except Exception:  # noqa: BLE001 - a key encrypted under a rotated ENCRYPTION_KEY
            logger.warning("Stored assistant API key could not be decrypted; using the environment's")
    if not key and settings.ANTHROPIC_API_KEY:
        key, source = settings.ANTHROPIC_API_KEY, "environment"
    effort = value.get("effort")
    return AssistantConfig(
        model=(value.get("model") or settings.ANTHROPIC_MODEL or DEFAULT_MODEL).strip(),
        api_key=key,
        max_output_tokens=_clamp_output(value.get("max_output_tokens") or DEFAULT_MAX_OUTPUT),
        effort=effort if effort in EFFORTS else None,
        key_source=source,
    )


async def public(db: AsyncSession) -> dict[str, Any]:
    """The settings as the page shows them. Never the key."""
    cfg = await resolve(db)
    row = await _row(db)
    value = dict(row.value) if row and row.value else {}
    return {
        "model": cfg.model,
        "model_from": "settings" if value.get("model") else "environment",
        "api_key_set": cfg.api_key is not None,
        "api_key_source": cfg.key_source,
        "max_output_tokens": cfg.max_output_tokens,
        "effort": cfg.effort,
        "models": MODELS,
        "efforts": list(EFFORTS),
        "limits": {"min_output": MIN_OUTPUT, "max_output": MAX_OUTPUT_CEILING},
    }


async def save(db: AsyncSession, *, model: str, api_key: str | None, clear_key: bool,
               max_output_tokens: int, effort: str | None) -> dict[str, Any]:
    row = await _row(db)
    value = dict(row.value) if row and row.value else {}
    value["model"] = model.strip()
    value["max_output_tokens"] = _clamp_output(max_output_tokens)
    value["effort"] = effort if effort in EFFORTS else None
    if clear_key:
        value.pop("api_key", None)
    elif api_key and api_key.strip():
        value["api_key"] = base64.b64encode(encrypt(api_key.strip())).decode("ascii")
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=SETTINGS_KEY, value=value))
    await db.flush()
    return await public(db)


async def test(db: AsyncSession) -> dict[str, Any]:
    """One tiny request with the saved settings: is the key good and the model real."""
    cfg = await resolve(db)
    if not cfg.api_key:
        return {"ok": False, "model": cfg.model, "error": "No API key: save one here or set ANTHROPIC_API_KEY"}
    client = AsyncAnthropic(api_key=cfg.api_key, max_retries=1, timeout=60.0)
    started = time.monotonic()
    try:
        resp = await client.messages.create(
            model=cfg.model,
            max_tokens=64,
            messages=[{"role": "user", "content": "Reply with the single word OK."}],
            **cfg.request_extras(),
        )
    except anthropic.AuthenticationError:
        return {"ok": False, "model": cfg.model, "error": "Anthropic rejected the API key"}
    except anthropic.NotFoundError:
        return {"ok": False, "model": cfg.model, "error": f"Anthropic does not know the model {cfg.model!r}"}
    except anthropic.APIStatusError as e:
        return {"ok": False, "model": cfg.model, "error": f"Anthropic returned {e.status_code}: {e.message}"}
    except anthropic.APIConnectionError:
        return {"ok": False, "model": cfg.model, "error": "Could not reach Anthropic"}
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text").strip()
    return {"ok": True, "model": resp.model, "reply": text[:80],
            "latency_ms": int((time.monotonic() - started) * 1000)}

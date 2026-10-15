"""Which AI the systems chat talks to, and with what.

Settings live in one ``app_settings`` row keyed ``assistant``::

    {"provider": "deepseek",
     "models": {"anthropic": "claude-sonnet-5-5", "deepseek": "deepseek-flash"},
     "keys": {"anthropic": "<base64 ciphertext>", "deepseek": "<base64 ciphertext>"},
     "max_output_tokens": 16000, "effort": "medium"}

Each provider remembers its own model and key, so switching providers never
loses the others' credentials. Before 2026-10-15 the row held one flat
``model`` and ``api_key``; those still read as Anthropic's, and the next save
folds them into the per-provider shape. Every field falls back to the
environment (``ANTHROPIC_MODEL`` / ``ANTHROPIC_API_KEY`` for Anthropic, a key
variable per provider otherwise) or a default, so an instance configured the
old way keeps working with nothing saved here. Keys are encrypted like every
other provider credential in app_settings, which is also how
scripts/rekey_encrypted.py finds them - it walks the whole JSON blob.
"""
from __future__ import annotations

import base64
import logging
import time
from dataclasses import dataclass, replace
from typing import Any

from anthropic import AsyncAnthropic
import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.encryption import decrypt, encrypt
from app.models.app_settings import AppSettings
from app.services import openai_client

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
# per-turn estimate. A null price means the provider has not published one.
PROVIDERS: dict[str, dict[str, Any]] = {
    "anthropic": {
        "label": "Anthropic",
        "api": "anthropic",
        "base_url": None,
        "key_env": "ANTHROPIC_API_KEY",
        "key_label": "Anthropic API key",
        "key_placeholder": "sk-ant-…",
        "key_help": "console.anthropic.com",
        "note": "First-party Claude models over the Anthropic API.",
        "default_model": DEFAULT_MODEL,
        "models": [
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
        ],
    },
    "deepseek": {
        "label": "DeepSeek",
        "api": "openai",
        "base_url": "https://api.deepseek.com",
        "key_env": "DEEPSEEK_API_KEY",
        "key_label": "DeepSeek API key",
        "key_placeholder": "sk-…",
        "key_help": "platform.deepseek.com",
        "note": "Strong and cheap, over DeepSeek's OpenAI-compatible API.",
        "default_model": "deepseek-flash",
        "models": [
            {"id": "deepseek-flash", "label": "DeepSeek Flash", "input": 0.3, "output": 1.2,
             "note": "Current general model, thinking or not. Peak price; off-peak halves it."},
            {"id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro", "input": 1.32, "output": 3.96,
             "note": "Largest DeepSeek, for the hardest write-ups. Peak price; off-peak halves it."},
        ],
    },
    "ionos": {
        "label": "IONOS AI Model Hub",
        "api": "openai",
        "base_url": "https://openai.inference.de-txl.ionos.com/v1",
        "key_env": "IONOS_API_TOKEN",
        "key_label": "IONOS API token",
        "key_placeholder": "Paste the token…",
        "key_help": "IONOS Cloud access management",
        "note": "Open models hosted in Germany, over IONOS's OpenAI-compatible Model Hub.",
        "default_model": "meta-llama/Llama-3.3-70B-Instruct",
        "models": [
            {"id": "meta-llama/Llama-3.3-70B-Instruct", "label": "Llama 3.3 70B", "input": 0.71, "output": 0.71,
             "note": "Meta's 70B instruct model. Reliable tool calling."},
            {"id": "gpt-oss-120b", "label": "GPT-OSS 120B", "input": 0.17, "output": 0.71,
             "note": "OpenAI's open 120B model. Built for agentic tool use."},
        ],
    },
    "muse": {
        "label": "Muse Spark",
        "api": "openai",
        "base_url": "https://api.meta.ai/v1",
        "key_env": "MODEL_API_KEY",
        "key_label": "Meta Model API key",
        "key_placeholder": "Paste the key…",
        "key_help": "dev.meta.ai",
        "note": "Meta's Muse Spark over the Meta Model API (public preview).",
        "default_model": "muse-spark-1.3",
        "models": [
            {"id": "muse-spark-1.3", "label": "Muse Spark 1.3", "input": None, "output": None,
             "note": "Current Spark: 1M context, built for tool use."},
            {"id": "muse-spark-1.1", "label": "Muse Spark 1.1", "input": None, "output": None,
             "note": "Previous Spark. Same API."},
        ],
    },
}
# Models that refuse an effort setting outright.
_NO_EFFORT = {"claude-haiku-4-5"}


def uses_openai_api(provider: str) -> bool:
    return PROVIDERS.get(provider, PROVIDERS["anthropic"])["api"] == "openai"


@dataclass
class AssistantConfig:
    model: str
    api_key: str | None
    max_output_tokens: int
    effort: str | None
    key_source: str | None      # "settings" | "environment" | None
    provider: str = "anthropic"

    def request_extras(self) -> dict[str, Any]:
        """Parameters that depend on the model, for messages.create/stream.

        Anthropic only; the OpenAI-compatible path sends no effort."""
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


def _saved_model(value: dict[str, Any], provider: str) -> str | None:
    models = value.get("models") or {}
    if models.get(provider):
        return models[provider]
    if provider == "anthropic" and value.get("model"):
        return value["model"]            # pre-2026-10-15 flat shape
    return None


def _stored_key(value: dict[str, Any], provider: str) -> str | None:
    keys = value.get("keys") or {}
    if keys.get(provider):
        return keys[provider]
    if provider == "anthropic" and value.get("api_key"):
        return value["api_key"]          # pre-2026-10-15 flat shape
    return None


def resolve_value(value: dict[str, Any]) -> AssistantConfig:
    """The effective config for a settings blob. Pure, so tests cover it."""
    provider = value.get("provider") or "anthropic"
    if provider not in PROVIDERS:
        logger.warning("Unknown assistant provider %r; using Anthropic", provider)
        provider = "anthropic"
    spec = PROVIDERS[provider]
    model = _saved_model(value, provider)
    if not model:
        model = (settings.ANTHROPIC_MODEL or DEFAULT_MODEL) if provider == "anthropic" else spec["default_model"]
    key, source = None, None
    stored = _stored_key(value, provider)
    if stored:
        try:
            key, source = decrypt(base64.b64decode(stored)), "settings"
        except Exception:  # noqa: BLE001 - a key encrypted under a rotated ENCRYPTION_KEY
            logger.warning("Stored assistant API key could not be decrypted; using the environment's")
    if not key:
        env_key = getattr(settings, spec["key_env"], "") or ""
        if env_key:
            key, source = env_key, "environment"
    effort = value.get("effort")
    return AssistantConfig(
        model=model.strip(),
        api_key=key,
        max_output_tokens=_clamp_output(value.get("max_output_tokens") or DEFAULT_MAX_OUTPUT),
        effort=effort if effort in EFFORTS else None,
        key_source=source,
        provider=provider,
    )


async def resolve(db: AsyncSession) -> AssistantConfig:
    row = await _row(db)
    return resolve_value(dict(row.value) if row and row.value else {})


async def public(db: AsyncSession) -> dict[str, Any]:
    """The settings as the page shows them. Never the key."""
    row = await _row(db)
    value = dict(row.value) if row and row.value else {}
    cfg = resolve_value(value)
    return {
        "provider": cfg.provider,
        "providers": [
            {"id": pid, **{k: spec[k] for k in (
                "label", "api", "key_env", "key_label", "key_placeholder",
                "key_help", "note", "default_model", "models")}}
            for pid, spec in PROVIDERS.items()
        ],
        "model": cfg.model,
        "model_from": "settings" if _saved_model(value, cfg.provider) else "environment",
        "api_key_set": cfg.api_key is not None,
        "api_key_source": cfg.key_source,
        "max_output_tokens": cfg.max_output_tokens,
        "effort": cfg.effort,
        "models": PROVIDERS[cfg.provider]["models"],
        "efforts": list(EFFORTS),
        "limits": {"min_output": MIN_OUTPUT, "max_output": MAX_OUTPUT_CEILING},
    }


async def save(db: AsyncSession, *, provider: str, model: str, api_key: str | None, clear_key: bool,
               max_output_tokens: int, effort: str | None) -> dict[str, Any]:
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider {provider!r}")
    row = await _row(db)
    value = dict(row.value) if row and row.value else {}
    # Fold the pre-2026-10-15 flat fields into the per-provider shape, then
    # drop them, so the row ends up in one shape whatever it started as.
    models = dict(value.get("models") or {})
    keys = dict(value.get("keys") or {})
    legacy_model = value.pop("model", None)
    if legacy_model and "anthropic" not in models:
        models["anthropic"] = legacy_model
    legacy_key = value.pop("api_key", None)
    if legacy_key and "anthropic" not in keys:
        keys["anthropic"] = legacy_key
    models[provider] = model.strip()
    if clear_key:
        keys.pop(provider, None)
    elif api_key and api_key.strip():
        keys[provider] = base64.b64encode(encrypt(api_key.strip())).decode("ascii")
    value["provider"] = provider
    value["models"] = models
    value["keys"] = keys
    value["max_output_tokens"] = _clamp_output(max_output_tokens)
    value["effort"] = effort if effort in EFFORTS else None
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=SETTINGS_KEY, value=value))
    await db.flush()
    return await public(db)


async def test(db: AsyncSession, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """One tiny request: is the key good and the model real.

    ``overrides`` carries what the settings page currently shows, so the
    button tests the on-screen values rather than the saved ones: pick a
    model, test it, save only when it answers. Anything not overridden
    falls back to the saved settings, then the environment. A key passed
    here is used for this request only and never stored.
    """
    overrides = overrides or {}
    row = await _row(db)
    saved = dict(row.value) if row and row.value else {}
    provider = overrides.get("provider") or saved.get("provider") or "anthropic"
    if provider not in PROVIDERS:
        return {"ok": False, "provider": provider, "model": "", "error": f"Unknown provider {provider!r}"}
    spec = PROVIDERS[provider]
    merged = dict(saved)
    merged["provider"] = provider
    if (overrides.get("model") or "").strip():
        merged_models = dict(merged.get("models") or {})
        merged_models[provider] = overrides["model"].strip()
        merged["models"] = merged_models
    if overrides.get("max_output_tokens") is not None:
        merged["max_output_tokens"] = overrides["max_output_tokens"]
    if "effort" in overrides:
        merged["effort"] = overrides["effort"]
    cfg = resolve_value(merged)
    form_key = (overrides.get("api_key") or "").strip()
    if form_key:
        cfg = replace(cfg, api_key=form_key, key_source="form")
    if not cfg.api_key:
        return {"ok": False, "provider": provider, "model": cfg.model,
                "error": f"No {spec['label']} API key: save one here or set {spec['key_env']}"}
    if spec["api"] == "anthropic":
        return await _test_anthropic(cfg)
    return await _test_openai(spec, cfg)


async def _test_anthropic(cfg: AssistantConfig) -> dict[str, Any]:
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
        return {"ok": False, "provider": "anthropic", "model": cfg.model,
                "error": "Anthropic rejected the API key"}
    except anthropic.NotFoundError:
        return {"ok": False, "provider": "anthropic", "model": cfg.model,
                "error": f"Anthropic does not know the model {cfg.model!r}"}
    except anthropic.APIStatusError as e:
        return {"ok": False, "provider": "anthropic", "model": cfg.model,
                "error": f"Anthropic returned {e.status_code}: {e.message}"}
    except anthropic.APIConnectionError:
        return {"ok": False, "provider": "anthropic", "model": cfg.model,
                "error": "Could not reach Anthropic"}
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text").strip()
    return {"ok": True, "provider": "anthropic", "model": resp.model, "reply": text[:80],
            "latency_ms": int((time.monotonic() - started) * 1000)}


async def _test_openai(spec: dict[str, Any], cfg: AssistantConfig) -> dict[str, Any]:
    label = spec["label"]
    client = openai_client.OpenAICompatClient(spec["base_url"], cfg.api_key or "", timeout=60.0)
    started = time.monotonic()
    try:
        data = await client.complete({
            "model": cfg.model,
            "max_tokens": 64,
            "messages": [{"role": "user", "content": "Reply with the single word OK."}],
        })
    except openai_client.ProviderError as e:
        if e.status == 404:
            error = f"{label} does not know the model {cfg.model!r}"
        else:
            error = openai_client.describe_error(label, e)
        return {"ok": False, "provider": cfg.provider, "model": cfg.model, "error": error}
    msg = (data.get("choices") or [{}])[0].get("message") or {}
    text = msg.get("content") or ""
    return {"ok": True, "provider": cfg.provider, "model": data.get("model") or cfg.model,
            "reply": text.strip()[:80], "latency_ms": int((time.monotonic() - started) * 1000)}

"""Minimal OpenAI-compatible chat client for the systems chat.

DeepSeek, the IONOS AI Model Hub and Meta's Model API all speak the
``POST {base_url}/chat/completions`` dialect with bearer auth, so one small
httpx client serves all three - no extra dependency, no SDK per provider.
The chat loop that uses it lives in ``openai_chat.py``; the settings page's
test button uses it too, for its one tiny request.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.net_guard import guarded_client

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    """An OpenAI-compatible API call failed. ``status`` is None when the
    request never got an answer (connection or timeout)."""

    def __init__(self, status: int | None, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def describe_error(label: str, err: ProviderError) -> str:
    """One line for the UI, naming the provider that failed."""
    if err.status in (401, 403):
        return f"{label} rejected the API key"
    if err.status == 429:
        return f"{label} rate limit hit - try again in a moment"
    if err.status is None:
        return f"Could not reach {label}: {err.message}"
    return f"{label} returned {err.status}: {err.message}"


class OpenAICompatClient:
    """POSTs chat completions, retrying the transient failures."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 300.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    async def complete(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = self.base_url + "/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        last: ProviderError | None = None
        for attempt in range(3):
            try:
                async with guarded_client(timeout=self.timeout) as http:
                    resp = await http.post(url, headers=headers, json=payload)
            except (httpx.ConnectError, httpx.TimeoutException, OSError) as e:
                raise ProviderError(None, str(e) or e.__class__.__name__) from e
            if resp.status_code < 400:
                try:
                    data = resp.json()
                except ValueError as e:
                    raise ProviderError(resp.status_code, "did not return JSON") from e
                if not isinstance(data, dict):
                    raise ProviderError(resp.status_code, "did not return a JSON object")
                return data
            last = ProviderError(resp.status_code, _error_text(resp))
            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt < 2:
                    await asyncio.sleep(2.0 * (attempt + 1))
                    continue
            raise last
        assert last is not None  # the loop always sets it before continuing
        raise last


def _error_text(resp: httpx.Response) -> str:
    try:
        data = resp.json()
    except ValueError:
        return resp.text[:200] or f"HTTP {resp.status_code}"
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])[:300]
        if isinstance(err, str):
            return err[:300]
        if data.get("message"):
            return str(data["message"])[:300]
    return resp.text[:200] or f"HTTP {resp.status_code}"

"""Minimal MCP Streamable-HTTP client for MemPalace.

Speaks JSON-RPC 2.0 over a single POST/SSE round-trip per call. We
re-initialize on each tool call to keep the implementation stateless —
MemPalace tool calls are infrequent enough that the overhead is fine.

Falls back to empty results if the server is unreachable so the chat
endpoint stays usable without the palace.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _parse_sse_or_json(resp: httpx.Response) -> list[dict]:
    """Return JSON-RPC messages from either application/json or text/event-stream."""
    ctype = resp.headers.get("content-type", "")
    text = resp.text
    if "application/json" in ctype:
        data = resp.json()
        return [data] if isinstance(data, dict) else list(data)
    # SSE: lines starting with "data: " carry JSON payloads
    out: list[dict] = []
    for line in text.splitlines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            if not payload:
                continue
            try:
                out.append(json.loads(payload))
            except json.JSONDecodeError:
                logger.debug("skipping non-JSON SSE line: %s", payload[:120])
    return out


class MemPalaceClient:
    def __init__(self, url: str, token: str | None = None, timeout: float = 15.0):
        # Use the URL as configured. The server may want trailing slash or not;
        # follow_redirects handles either case.
        self.url = url
        self.token = token
        self.timeout = timeout

    def _headers(self, session_id: str | None = None) -> dict[str, str]:
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if session_id:
            h["Mcp-Session-Id"] = session_id
        return h

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        """Initialize a session and call one tool. Returns the tool's structured result."""
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as http:
            init_id = str(uuid.uuid4())
            init_payload = {
                "jsonrpc": "2.0",
                "id": init_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "docuvault-systems-chat", "version": "1.0"},
                },
            }
            init_resp = await http.post(self.url, headers=self._headers(), json=init_payload)
            init_resp.raise_for_status()
            session_id = init_resp.headers.get("mcp-session-id")

            # Per spec, send the initialized notification before any tool call
            await http.post(
                self.url,
                headers=self._headers(session_id),
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            )

            call_id = str(uuid.uuid4())
            call_payload = {
                "jsonrpc": "2.0",
                "id": call_id,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            }
            call_resp = await http.post(self.url, headers=self._headers(session_id), json=call_payload)
            call_resp.raise_for_status()
            messages = _parse_sse_or_json(call_resp)

            for msg in messages:
                if msg.get("id") == call_id:
                    if "error" in msg:
                        raise RuntimeError(f"MCP error: {msg['error']}")
                    result = msg.get("result", {})
                    # MCP tool result: { content: [{type:'text', text:'...'}], structuredContent?: {...} }
                    if "structuredContent" in result:
                        return result["structuredContent"]
                    blocks = result.get("content", [])
                    text_parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
                    joined = "\n".join(text_parts).strip()
                    # Many palace tools return JSON-as-text — try parsing
                    if joined.startswith("{") or joined.startswith("["):
                        try:
                            return json.loads(joined)
                        except json.JSONDecodeError:
                            pass
                    return joined or result
            raise RuntimeError("MCP: no matching response received")

    async def search(self, query: str, top_k: int = 8) -> Any:
        try:
            return await self.call_tool("palace_search", {"query": query, "top_k": top_k})
        except Exception as e:
            logger.warning("palace_search failed: %s", e)
            return {"error": str(e), "items": []}

    async def read_drawer(self, drawer_id: str) -> Any:
        try:
            return await self.call_tool("palace_read", {"id": drawer_id})
        except Exception as e:
            logger.warning("palace_read failed: %s", e)
            return {"error": str(e)}

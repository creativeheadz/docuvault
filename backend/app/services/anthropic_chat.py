"""Anthropic-driven chat orchestration for system documentation.

The LLM has three tools:
  * search_palace(query)            — search MemPalace for relevant memories
  * read_palace_drawer(drawer_id)   — fetch one drawer's full content
  * update_system_draft(patch)      — merge partial fields into the working record

Each user turn drives a tool-use loop until the model returns a stop_reason
of "end_turn" with no more tool_use blocks. The full conversation (user +
assistant + tool_use + tool_result blocks) is persisted in
system_chat_messages so the next turn replays the same context.

Cost controls:
  * Static system prompt + tools are cached via cache_control (5-min TTL).
  * Old MemPalace tool_result blobs are stubbed before being sent back —
    full text is kept in the DB for UI fidelity but not re-sent forever.
  * Usage (input/output/cache tokens + model) is recorded per assistant row
    so the UI can render a running cost.
"""

from __future__ import annotations

import copy
import json
import logging
from typing import Any

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.system import System
from app.services import system_service
from app.services.mempalace_client import MemPalaceClient

logger = logging.getLogger(__name__)


# Maximum tool-use rounds inside a single user turn. Keep tight — runaway
# loops eat tokens fast.
MAX_TOOL_ROUNDS = 6
# Cap output per call. Replies are short ack-and-question turns.
MAX_OUTPUT_TOKENS = 1024
# Tool_results older than this many turns get stubbed before re-send.
KEEP_FULL_TOOL_RESULT_TURNS = 1


SYSTEM_PROMPT = """You are the documentation assistant inside DocuVault, helping the user (Andrei) describe one of his many systems / VMs / SaaS tools / services. The current draft record is shown to you each turn.

Your job is to:
  1. Use `search_palace` aggressively when the user mentions things by name — Andrei stores facts about his infrastructure, family, projects, and Old Forge stack in MemPalace. Verify before guessing.
  2. Propose concrete updates to the draft via `update_system_draft`. Patches MERGE: snippets are merged key-by-key, tags/palace_drawer_ids replace. Only send fields you want to change.
  3. After updating, briefly summarize what you changed and ask one focused question to refine the next field. Keep replies tight — Andrei reads diffs, not prose.
  4. The `body` field is markdown. Use it for the long-form narrative (purpose, architecture, gotchas). Use `snippets` for short structured facts (hostname, ports, urls, owner, vault refs, etc.). Use `tags` for routing labels.

Do NOT invent details. If something is unknown, ask. If a memory looks stale, flag it."""


SEARCH_PALACE_TOOL = {
    "name": "search_palace",
    "description": "Search Andrei's MemPalace (tiered, multi-valued memory) for drawers relevant to the query. Returns ranked snippets with drawer ids you can later read in full or attach to the system record.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Natural-language query."},
            "top_k": {"type": "integer", "default": 8},
        },
        "required": ["query"],
    },
}

READ_DRAWER_TOOL = {
    "name": "read_palace_drawer",
    "description": "Fetch the full content of one MemPalace drawer by id.",
    "input_schema": {
        "type": "object",
        "properties": {"drawer_id": {"type": "string"}},
        "required": ["drawer_id"],
    },
}

UPDATE_DRAFT_TOOL = {
    "name": "update_system_draft",
    "description": (
        "Apply a partial update to the working system record. snippets is merged key-by-key "
        "(use null to delete a key); tags and palace_drawer_ids replace; other fields replace. "
        "Send only fields you want to change."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "category": {"type": "string", "description": "e.g. server, vm, saas, vps, monitoring, secrets, identity, network."},
            "short_description": {"type": "string", "description": "≤500 chars, one-line."},
            "body": {"type": "string", "description": "Long-form markdown."},
            "tags": {"type": "array", "items": {"type": "string"}},
            "snippets": {
                "type": "object",
                "description": "Short structured facts. Keys like hostname, ip, ports, url, owner, vault_ref. Values are strings.",
                "additionalProperties": True,
            },
            "palace_drawer_ids": {"type": "array", "items": {"type": "string"}, "description": "MemPalace drawer ids to link to this system."},
            "status": {"type": "string", "enum": ["draft", "active", "archived"]},
            "color": {"type": "string", "description": "Optional hex or token name for UI accent."},
            "icon": {"type": "string", "description": "Optional lucide-react icon name."},
        },
        "additionalProperties": False,
    },
}

TOOLS_RAW = [SEARCH_PALACE_TOOL, READ_DRAWER_TOOL, UPDATE_DRAFT_TOOL]


def _system_snapshot(system: System) -> str:
    return json.dumps(
        {
            "id": str(system.id),
            "name": system.name,
            "slug": system.slug,
            "category": system.category,
            "short_description": system.short_description,
            "body": system.body,
            "tags": list(system.tags or []),
            "snippets": dict(system.snippets or {}),
            "palace_drawer_ids": list(system.palace_drawer_ids or []),
            "status": system.status,
        },
        indent=2,
        default=str,
    )


def _build_system_blocks(system: System) -> list[dict]:
    """System prompt: static instructions then the current draft snapshot.

    No cache_control on the static block: Haiku 4.5's minimum cacheable prefix
    is 4096 tokens, and SYSTEM_PROMPT + tools combined is ~1k tokens. A marker
    here silently never engages. Caching is configured top-level on the request
    instead, so the API places the breakpoint on the last cacheable block —
    which becomes the conversation tail once history grows past 4k tokens.
    """
    return [
        {"type": "text", "text": SYSTEM_PROMPT},
        {"type": "text", "text": "CURRENT DRAFT:\n" + _system_snapshot(system)},
    ]


def _build_tools() -> list[dict]:
    return [dict(t) for t in TOOLS_RAW]


def _trim_history_for_api(history: list[dict]) -> list[dict]:
    """Stub old palace tool_result blobs to keep the resent context small.

    The DB keeps the full content for UI display; we only trim what we send
    back to Anthropic. update_system_draft results are kept (the model uses
    them to know what landed), but search_palace / read_palace_drawer dumps
    are replaced with a short marker once they're more than a couple of
    turns old.

    A "turn" boundary here is each user → assistant pair. We keep the most
    recent KEEP_FULL_TOOL_RESULT_TURNS untouched and stub the rest.
    """
    if not history:
        return history

    # Walk backwards and find the cutoff point (count user-text turns).
    user_text_count = 0
    cutoff_idx = 0
    for i in range(len(history) - 1, -1, -1):
        msg = history[i]
        # A "user-text" message is a user message whose first block is plain text
        # (i.e., a real user message, not a tool_result message).
        if msg.get("role") == "user":
            content = msg.get("content") or []
            if content and isinstance(content[0], dict) and content[0].get("type") == "text":
                user_text_count += 1
                if user_text_count > KEEP_FULL_TOOL_RESULT_TURNS:
                    cutoff_idx = i
                    break

    if cutoff_idx == 0:
        return history

    trimmed: list[dict] = []
    for idx, msg in enumerate(history):
        if idx >= cutoff_idx:
            trimmed.append(msg)
            continue
        # In old turns: shrink palace tool_results.
        if msg.get("role") == "user":
            new_content = []
            mutated = False
            for block in (msg.get("content") or []):
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    raw = block.get("content")
                    text = raw if isinstance(raw, str) else json.dumps(raw, default=str)
                    if len(text) > 240 and "update_system_draft" not in text:
                        new_content.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.get("tool_use_id"),
                                "content": "[trimmed: prior palace lookup; ask again if needed]",
                            }
                        )
                        mutated = True
                        continue
                new_content.append(block)
            if mutated:
                trimmed.append({"role": "user", "content": new_content})
                continue
        trimmed.append(msg)
    return trimmed


async def _run_tool(
    db: AsyncSession,
    system: System,
    palace: MemPalaceClient | None,
    name: str,
    args: dict,
) -> Any:
    if name == "search_palace":
        if not palace:
            return {"error": "MemPalace not configured (set MEMPALACE_URL)"}
        return await palace.search(args.get("query", ""), int(args.get("top_k") or 8))
    if name == "read_palace_drawer":
        if not palace:
            return {"error": "MemPalace not configured"}
        return await palace.read_drawer(args.get("drawer_id", ""))
    if name == "update_system_draft":
        diff = await system_service.apply_partial_update(system, args)
        await db.flush()
        await db.refresh(system)
        return {"applied": diff, "current": json.loads(_system_snapshot(system))}
    return {"error": f"unknown tool: {name}"}


def _usage_dict(usage_obj: Any, model: str) -> dict:
    """Normalize anthropic Usage into a plain dict for JSONB storage."""
    if usage_obj is None:
        return {"model": model}
    raw = usage_obj.model_dump() if hasattr(usage_obj, "model_dump") else dict(usage_obj)
    raw["model"] = model
    return raw


async def run_chat_turn(
    db: AsyncSession,
    system: System,
    user_text: str,
    history: list[dict],
) -> tuple[str, list[dict], list[dict]]:
    """Run one user turn through the LLM with tool-use loop.

    Returns:
        assistant_text: final assistant text
        tool_events: list of {name, input, output} for the UI
        new_messages: list of {role, content, usage?} dicts to persist.
            usage is set on assistant rows only.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    # Bump retries above the default 2 — Anthropic returns 529 Overloaded under
    # capacity pressure and the SDK retries with backoff. Five attempts spreads
    # over ~30s, well within our nginx 300s read timeout.
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=5)
    palace = (
        MemPalaceClient(settings.MEMPALACE_URL, settings.MEMPALACE_TOKEN)
        if settings.MEMPALACE_URL
        else None
    )
    model = settings.ANTHROPIC_MODEL

    trimmed_history = _trim_history_for_api(history)

    messages: list[dict] = list(trimmed_history) + [
        {"role": "user", "content": [{"type": "text", "text": user_text}]}
    ]
    new_messages: list[dict] = [
        {"role": "user", "content": [{"type": "text", "text": user_text}]}
    ]

    tool_events: list[dict] = []
    final_text = ""
    tools = _build_tools()

    for _ in range(MAX_TOOL_ROUNDS):
        resp = await client.messages.create(
            model=model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=_build_system_blocks(system),
            tools=tools,
            messages=messages,
            # Auto-place the cache breakpoint on the last cacheable block. Engages
            # once the request prefix exceeds 4096 tokens (Haiku 4.5 minimum) —
            # in practice a few turns into a conversation. Below that threshold
            # this is a no-op (no cache write, no cost penalty).
            cache_control={"type": "ephemeral"},
        )

        # Persist the assistant's blocks verbatim. Strip any cache_control hints
        # from the saved copy — they're transport-only.
        assistant_blocks = [b.model_dump() for b in resp.content]
        usage = _usage_dict(getattr(resp, "usage", None), model)

        messages.append({"role": "assistant", "content": copy.deepcopy(assistant_blocks)})
        new_messages.append(
            {"role": "assistant", "content": assistant_blocks, "usage": usage}
        )

        if resp.stop_reason != "tool_use":
            for block in resp.content:
                if block.type == "text":
                    final_text += block.text
            break

        # Run every tool_use block in this assistant turn, then send tool_result back.
        tool_results: list[dict] = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            try:
                output = await _run_tool(db, system, palace, block.name, dict(block.input))
            except Exception as e:
                logger.exception("tool %s failed", block.name)
                output = {"error": str(e)}
            tool_events.append({"name": block.name, "input": dict(block.input), "output": output})
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(output, default=str),
                }
            )

        messages.append({"role": "user", "content": tool_results})
        new_messages.append({"role": "user", "content": copy.deepcopy(tool_results)})

    return final_text.strip(), tool_events, new_messages

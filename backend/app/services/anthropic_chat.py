"""Anthropic-driven chat orchestration for system documentation.

The LLM has three tools:
  * search_palace(query)            — search MemPalace for relevant memories
  * read_palace_drawer(drawer_id)   — fetch one drawer's full content
  * update_system_draft(patch)      — merge partial fields into the working record

Each user turn drives a tool-use loop until the model returns a stop_reason
of "end_turn" with no more tool_use blocks. The full conversation (user +
assistant + tool_use + tool_result blocks) is persisted in
system_chat_messages so the next turn replays the same context.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.system import System
from app.services import system_service
from app.services.mempalace_client import MemPalaceClient

logger = logging.getLogger(__name__)


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

TOOLS = [SEARCH_PALACE_TOOL, READ_DRAWER_TOOL, UPDATE_DRAFT_TOOL]


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
        new_messages: list of message dicts to append to history
            ([{role, content}] — content is a list of Anthropic blocks)
    """
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    palace = (
        MemPalaceClient(settings.MEMPALACE_URL, settings.MEMPALACE_TOKEN)
        if settings.MEMPALACE_URL
        else None
    )

    # Inject the current draft as a synthetic system-message line at the top of every turn.
    sys_prompt = SYSTEM_PROMPT + "\n\nCURRENT DRAFT:\n" + _system_snapshot(system)

    messages: list[dict] = list(history) + [
        {"role": "user", "content": [{"type": "text", "text": user_text}]}
    ]
    new_messages: list[dict] = [
        {"role": "user", "content": [{"type": "text", "text": user_text}]}
    ]

    tool_events: list[dict] = []
    final_text = ""

    for _ in range(8):  # safety cap on tool-use rounds
        resp = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2048,
            system=sys_prompt,
            tools=TOOLS,
            messages=messages,
        )

        # Persist the assistant's blocks verbatim
        assistant_blocks = [b.model_dump() for b in resp.content]
        messages.append({"role": "assistant", "content": assistant_blocks})
        new_messages.append({"role": "assistant", "content": assistant_blocks})

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
        new_messages.append({"role": "user", "content": tool_results})

        # Refresh the snapshot in the system prompt so the model sees applied diffs.
        sys_prompt = SYSTEM_PROMPT + "\n\nCURRENT DRAFT:\n" + _system_snapshot(system)

    return final_text.strip(), tool_events, new_messages

"""Anthropic-driven chat orchestration for system documentation.

The LLM has three tools:
  * search_palace(query)            - search MemPalace for relevant memories
  * read_palace_drawer(drawer_id)   - fetch one drawer's full content
  * update_system_draft(patch)      - merge partial fields into the working record

Each user turn drives a tool-use loop until the model stops asking for tools.
The full conversation (user + assistant + tool_use + tool_result blocks) is
persisted in system_chat_messages and replayed verbatim on the next turn.

The history is append-only. Current models refuse a replayed conversation
whose earlier turns were edited (their thinking blocks are bound to it), and
any edit to an earlier turn also breaks the prompt-cache prefix, so nothing
here rewrites what was sent before: a repair is always something appended.

Which model, which key, how long a reply may be and at what effort come from
app_settings (services/assistant_settings.py), falling back to the
environment.

Cost controls:
  * The request is cached top-level (cache_control), so a resent history is
    mostly cache reads.
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
from app.services import assistant_settings, system_service
from app.services.mempalace_client import MemPalaceClient

logger = logging.getLogger(__name__)


# Maximum tool-use rounds inside a single user turn. Keep tight: runaway
# loops eat tokens fast.
MAX_TOOL_ROUNDS = 8


SYSTEM_PROMPT = """You are the documentation assistant inside DocuVault, helping the user (Andrei) describe one of his many systems: a machine on a client's network, a VM, a SaaS tool, a service. The current record is shown to you each turn, including its organisation and any inventory synced in from MeshCentral or Wegweiser.

Your job is to:
  1. Use `search_palace` aggressively when the user mentions things by name — Andrei stores facts about his infrastructure, family, projects, and Old Forge stack in MemPalace. Verify before guessing.
  2. Propose concrete updates to the draft via `update_system_draft`. Patches MERGE: snippets are merged key-by-key, tags/palace_drawer_ids replace. Only send fields you want to change.
  3. After updating, briefly summarize what you changed and ask one focused question to refine the next field. Keep replies tight — Andrei reads diffs, not prose.
  4. The `body` field is markdown. Use it for the long-form narrative (purpose, architecture, gotchas). Use `snippets` for short structured facts (ports, urls, owner, vault refs, etc.). Use `tags` for routing labels.
  5. Inventory fields (hostname, ip_address, operating_system, manufacturer, model, serial_number...) are often kept by a sync and overwritten on its next run. Fill one only when it is blank or the user asks; put knowledge in `body` and `snippets`, which no sync touches.

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
            "hostname": {"type": "string"},
            "ip_address": {"type": "string"},
            "mac_address": {"type": "string"},
            "operating_system": {"type": "string"},
            "os_version": {"type": "string"},
            "manufacturer": {"type": "string"},
            "model": {"type": "string"},
            "serial_number": {"type": "string"},
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
            "organization": system.organization.name if system.organization else None,
            "inventory": {
                k: getattr(system, k) for k in (
                    "hostname", "ip_address", "mac_address", "operating_system", "os_version",
                    "manufacturer", "model", "serial_number", "device_role",
                ) if getattr(system, k)
            },
            "synced_from": [s for s, linked in (
                ("MeshCentral", system.mesh_node_id),
            ) if linked],
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


def dangling_tool_uses(history: list[dict]) -> list[str]:
    """Tool calls the last assistant message made that nothing answered.

    A turn that stopped right after the model asked for a tool (a reply cut
    off at the output limit, before 2026-10-15) leaves its history ending on
    a tool_use, which the API refuses to continue. The next turn answers it
    by appending tool_results, never by editing the stored message."""
    if not history or history[-1].get("role") != "assistant":
        return []
    return [b["id"] for b in (history[-1].get("content") or [])
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id")]


def _not_run(tool_use_id: str, why: str) -> dict:
    return {"type": "tool_result", "tool_use_id": tool_use_id, "is_error": True,
            "content": json.dumps({"error": f"Not run: {why}"})}


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
        await system_service.get_system(db, system.id, fresh=True)  # reloads `system` in place
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
    *,
    client: Any = None,
    config: assistant_settings.AssistantConfig | None = None,
) -> tuple[str, list[dict], list[dict]]:
    """Run one user turn through the LLM with tool-use loop.

    Returns:
        assistant_text: final assistant text
        tool_events: list of {name, input, output} for the UI
        new_messages: list of {role, content, usage?} dicts to persist.
            usage is set on assistant rows only.

    `client` and `config` are for tests; normally both come from settings.
    """
    config = config or await assistant_settings.resolve(db)
    if client is None:
        if not config.api_key:
            raise RuntimeError("No Anthropic API key: set one under Settings > AI assistant")
        # Bump retries above the default 2: Anthropic returns 529 Overloaded
        # under capacity pressure and the SDK retries with backoff. Five
        # attempts spread over ~30s, well within nginx's 300s read timeout.
        client = AsyncAnthropic(api_key=config.api_key, max_retries=5)
    palace = (
        MemPalaceClient(settings.MEMPALACE_URL, settings.MEMPALACE_TOKEN)
        if settings.MEMPALACE_URL
        else None
    )
    model = config.model

    # A conversation left ending on an unanswered tool call is answered in
    # the same user turn as the new message: appended, not edited.
    opening = [_not_run(i, "the previous reply ended before this call could run") for i in dangling_tool_uses(history)]
    opening.append({"type": "text", "text": user_text})

    messages: list[dict] = list(history) + [{"role": "user", "content": opening}]
    new_messages: list[dict] = [{"role": "user", "content": copy.deepcopy(opening)}]

    tool_events: list[dict] = []
    final_text = ""
    tools = _build_tools()

    for _ in range(MAX_TOOL_ROUNDS):
        # Streamed so a long reply (a whole body of markdown in one tool
        # call) is not held to the non-streaming request ceiling.
        async with client.messages.stream(
            model=model,
            max_tokens=config.max_output_tokens,
            system=_build_system_blocks(system),
            tools=tools,
            messages=messages,
            # Auto-place the cache breakpoint on the last cacheable block. It
            # engages once the prefix passes the model's minimum; below that
            # this is a no-op.
            cache_control={"type": "ephemeral"},
            **config.request_extras(),
        ) as stream:
            resp = await stream.get_final_message()

        assistant_blocks = [b.model_dump() for b in resp.content]
        usage = _usage_dict(getattr(resp, "usage", None), model)
        messages.append({"role": "assistant", "content": copy.deepcopy(assistant_blocks)})
        new_messages.append({"role": "assistant", "content": assistant_blocks, "usage": usage})

        tool_uses = [b for b in resp.content if b.type == "tool_use"]
        text = "".join(b.text for b in resp.content if b.type == "text")

        if resp.stop_reason == "tool_use":
            tool_results: list[dict] = []
            for block in tool_uses:
                try:
                    output = await _run_tool(db, system, palace, block.name, dict(block.input))
                except Exception as e:
                    logger.exception("tool %s failed", block.name)
                    output = {"error": str(e)}
                tool_events.append({"name": block.name, "input": dict(block.input), "output": output})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(output, default=str),
                })
            messages.append({"role": "user", "content": tool_results})
            new_messages.append({"role": "user", "content": copy.deepcopy(tool_results)})
            continue

        if resp.stop_reason == "max_tokens" and tool_uses:
            # Cut off while writing a tool call: its input cannot be trusted,
            # so it is not run. Say so, and let the model try again smaller.
            why = (f"your reply reached the {config.max_output_tokens}-token output limit and was "
                   "cut off, so nothing was changed. Send it again in smaller pieces, for "
                   "example the body in a call of its own.")
            results = [_not_run(b.id, why) for b in tool_uses]
            for b in tool_uses:
                tool_events.append({"name": b.name, "input": {}, "output": {"error": f"Not run: {why}"}})
            messages.append({"role": "user", "content": results})
            new_messages.append({"role": "user", "content": copy.deepcopy(results)})
            continue

        if resp.stop_reason == "max_tokens":
            final_text = text + "\n\n(The reply reached the output limit and was cut off.)"
        elif resp.stop_reason == "refusal":
            final_text = text or "(The model declined to answer this.)"
        else:
            final_text = text
        break
    else:
        final_text = (f"(Stopped after {MAX_TOOL_ROUNDS} rounds of tool use without a final answer. "
                      "Say \"continue\" to carry on.)")

    return final_text.strip(), tool_events, new_messages

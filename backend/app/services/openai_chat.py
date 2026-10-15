"""Chat orchestration for the OpenAI-compatible providers.

DeepSeek, IONOS and Meta's Model API all speak Chat Completions with tool
calling, so they share this loop. The tools, the system prompt and the tool
runners are the same objects the Anthropic path uses (imported from
``anthropic_chat``); only the wire format differs.

History is still stored as Anthropic-style content blocks, whatever provider
wrote it, so switching providers mid-conversation keeps working and the page
renders every turn the same way. Each request converts the stored blocks to
Chat Completions messages and converts the answer back for storage:

  * ``text`` blocks join into the message content; ``tool_use`` becomes a
    ``tool_calls`` entry and ``tool_result`` a ``tool`` message. A user
    message holding both (a repair plus the new text) sends the tool
    messages first: the API requires tool answers to follow the assistant
    message that asked for them directly.
  * Anything else a block list holds - thinking blocks, above all - is
    dropped. It cannot be sent back and the models do not need it.

Two Anthropic features have no counterpart here and are ignored: prompt
caching (usage rows carry plain input/output token counts) and the effort
setting.
"""

from __future__ import annotations

import copy
import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.system import System
from app.services import anthropic_chat, assistant_settings, system_service
from app.services.mempalace_client import MemPalaceClient
from app.services.openai_client import OpenAICompatClient, ProviderError, describe_error

logger = logging.getLogger(__name__)


def _oai_tools() -> list[dict]:
    return [
        {"type": "function", "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["input_schema"],
        }}
        for t in anthropic_chat.TOOLS_RAW
    ]


def _system_message(system: System) -> str:
    return anthropic_chat.SYSTEM_PROMPT + "\n\nCURRENT DRAFT:\n" + anthropic_chat._system_snapshot(system)


def to_openai_messages(history: list[dict]) -> list[dict]:
    """Stored Anthropic blocks -> Chat Completions ``messages``. Pure."""
    out: list[dict] = []
    for msg in history:
        blocks = msg.get("content") or []
        if isinstance(blocks, str):
            blocks = [{"type": "text", "text": blocks}]
        if msg.get("role") == "assistant":
            texts = [b.get("text", "") for b in blocks
                     if isinstance(b, dict) and b.get("type") == "text" and b.get("text")]
            calls = [
                {"id": b["id"], "type": "function", "function": {
                    "name": b.get("name", ""),
                    "arguments": json.dumps(b.get("input") or {}, default=str),
                }}
                for b in blocks
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id")
            ]
            assistant: dict[str, Any] = {"role": "assistant", "content": "".join(texts)}
            if calls:
                assistant["tool_calls"] = calls
            out.append(assistant)
        else:
            for b in blocks:
                if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("tool_use_id"):
                    content = b.get("content")
                    out.append({
                        "role": "tool",
                        "tool_call_id": b["tool_use_id"],
                        "content": content if isinstance(content, str)
                        else json.dumps(content, default=str),
                    })
            texts = [b.get("text", "") for b in blocks
                     if isinstance(b, dict) and b.get("type") == "text" and b.get("text")]
            if texts:
                out.append({"role": "user", "content": "".join(texts)})
    return out


def _usage_dict(data: dict, model: str) -> dict:
    """Normalize OpenAI usage into the same keys the page already reads."""
    out: dict[str, Any] = {"model": data.get("model") or model}
    usage = data.get("usage") or {}
    if usage:
        out["input_tokens"] = usage.get("prompt_tokens", 0)
        out["output_tokens"] = usage.get("completion_tokens", 0)
    return out


def _parse_args(raw: Any) -> tuple[dict, str | None]:
    if isinstance(raw, dict):
        return raw, None
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}, "the tool call arguments were not valid JSON"
    if not isinstance(parsed, dict):
        return {}, "the tool call arguments were not an object"
    return parsed, None


async def run_chat_turn(
    db: AsyncSession,
    system: System,
    user_text: str,
    history: list[dict],
    *,
    client: Any = None,
    config: assistant_settings.AssistantConfig | None = None,
) -> tuple[str, list[dict], list[dict]]:
    """Run one user turn. Same contract as the Anthropic path's: returns
    the final text, the tool events for the UI, and the new messages to
    persist (Anthropic-shaped blocks, whatever the provider).

    `client` needs only ``async complete(payload) -> dict``; tests hand in
    scripted replies, normally it is an `OpenAICompatClient`.
    """
    config = config or await assistant_settings.resolve(db)
    spec = assistant_settings.PROVIDERS.get(config.provider)
    if not spec or spec["api"] != "openai" or not spec["base_url"]:
        raise RuntimeError(f"Provider {config.provider!r} is not an OpenAI-compatible provider")
    label = spec["label"]
    if client is None:
        if not config.api_key:
            raise RuntimeError(f"No {label} API key: set one under Settings > AI assistant")
        client = OpenAICompatClient(spec["base_url"], config.api_key)
    palace = (
        MemPalaceClient(settings.MEMPALACE_URL, settings.MEMPALACE_TOKEN)
        if settings.MEMPALACE_URL
        else None
    )
    model = config.model

    # Same repair as the Anthropic path: a conversation left ending on an
    # unanswered tool call is answered in this turn, appended, not edited.
    opening = [anthropic_chat._not_run(i, "the previous reply ended before this call could run")
               for i in anthropic_chat.dangling_tool_uses(history)]
    opening.append({"type": "text", "text": user_text})

    oai_messages = to_openai_messages(list(history) + [{"role": "user", "content": opening}])
    new_messages: list[dict] = [{"role": "user", "content": copy.deepcopy(opening)}]

    tool_events: list[dict] = []
    final_text = ""
    tools = _oai_tools()
    system_text = _system_message(system)

    for _ in range(anthropic_chat.MAX_TOOL_ROUNDS):
        try:
            data = await client.complete({
                "model": model,
                "max_tokens": config.max_output_tokens,
                "messages": [{"role": "system", "content": system_text}] + oai_messages,
                "tools": tools,
            })
        except ProviderError as e:
            raise ProviderError(e.status, describe_error(label, e)) from e

        choice = (data.get("choices") or [{}])[0]
        answer = choice.get("message") or {}
        finish = choice.get("finish_reason")
        text = answer.get("content") or ""
        calls = answer.get("tool_calls") or []
        usage = _usage_dict(data, model)

        assistant_blocks: list[dict] = []
        if text:
            assistant_blocks.append({"type": "text", "text": text})
        parsed_calls: list[tuple[str, str, dict, str | None]] = []
        for call in calls:
            fn = call.get("function") or {}
            args, args_error = _parse_args(fn.get("arguments"))
            parsed_calls.append((call.get("id", ""), fn.get("name", ""), args, args_error))
            assistant_blocks.append({"type": "tool_use", "id": call.get("id", ""),
                                     "name": fn.get("name", ""), "input": args})
        oai_messages.append({"role": "assistant", "content": text or "",
                             **({"tool_calls": calls} if calls else {})})
        new_messages.append({"role": "assistant", "content": assistant_blocks, "usage": usage})

        if finish == "length" and calls:
            # Cut off while writing tool calls: their arguments cannot be
            # trusted, so none of them run. Say so, and let the model try
            # again smaller.
            why = (f"your reply reached the {config.max_output_tokens}-token output limit and was "
                   "cut off, so nothing was changed. Send it again in smaller pieces, for "
                   "example the body in a call of its own.")
            results = [anthropic_chat._not_run(cid, why) for cid, _, _, _ in parsed_calls]
            for _, name, _, _ in parsed_calls:
                tool_events.append({"name": name, "input": {}, "output": {"error": f"Not run: {why}"}})
            for r in results:
                oai_messages.append({"role": "tool", "tool_call_id": r["tool_use_id"], "content": r["content"]})
            new_messages.append({"role": "user", "content": copy.deepcopy(results)})
            continue

        if calls:
            tool_results: list[dict] = []
            for cid, name, args, args_error in parsed_calls:
                if args_error:
                    output = {"error": args_error}
                else:
                    try:
                        output = await anthropic_chat._run_tool(db, system, palace, name, args)
                    except Exception as e:
                        logger.exception("tool %s failed", name)
                        output = {"error": str(e)}
                tool_events.append({"name": name, "input": args, "output": output})
                content = json.dumps(output, default=str)
                tool_results.append({"type": "tool_result", "tool_use_id": cid, "content": content})
                oai_messages.append({"role": "tool", "tool_call_id": cid, "content": content})
            new_messages.append({"role": "user", "content": copy.deepcopy(tool_results)})
            continue

        if finish == "length":
            final_text = text + "\n\n(The reply reached the output limit and was cut off.)"
        elif finish == "refusal" or answer.get("refusal"):
            final_text = text or answer.get("refusal") or "(The model declined to answer this.)"
        else:
            final_text = text
        break
    else:
        final_text = (f"(Stopped after {anthropic_chat.MAX_TOOL_ROUNDS} rounds of tool use without a final answer. "
                      "Say \"continue\" to carry on.)")

    return final_text.strip(), tool_events, new_messages

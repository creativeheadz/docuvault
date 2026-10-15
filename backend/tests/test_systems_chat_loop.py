"""The systems chat's tool loop, against a stand-in for Claude.

2026-10-15: a reply that hit the 1024-token output cap while writing a long
body into update_system_draft was treated as the end of the turn. The tool
never ran, the page said "Draft updated" anyway, and the stored conversation
ended on an unanswered tool call, which the API refuses to continue. These
pin the three things that went wrong, and that every repair is appended
rather than written over history the model has already seen.
"""
import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.system import System  # noqa: E402
from app.services import anthropic_chat  # noqa: E402
from app.services.assistant_settings import AssistantConfig  # noqa: E402


def _block(type_, **kw):
    b = NS(type=type_, **kw)
    b.model_dump = lambda: {"type": type_, **kw}
    return b


def text(t):
    return _block("text", text=t)


def tool(id_, name="update_system_draft", input_=None):
    return _block("tool_use", id=id_, name=name, input=input_ or {"body": "x"})


def reply(stop, *blocks):
    return NS(content=list(blocks), stop_reason=stop, usage=None)


class FakeClient:
    """Hands out the scripted replies in order and records every request."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests = []
        self.messages = self

    def stream(self, **kwargs):
        self.requests.append(json.loads(json.dumps(kwargs, default=str)))
        nxt = self.replies.pop(0)

        class _Stream:
            async def __aenter__(s):
                return s

            async def __aexit__(s, *a):
                return False

            async def get_final_message(s):
                return nxt
        return _Stream()


CONFIG = AssistantConfig(model="claude-sonnet-5-5", api_key="k", max_output_tokens=16000,
                         effort="medium", key_source="settings")


def run(client, history=(), config=CONFIG, ran=None):
    async def fake_tool(db, system, palace, name, args):
        if ran is None:
            raise AssertionError(f"{name} should not have run")
        ran.append((name, args))
        return {"applied": args}

    anthropic_chat._run_tool, original = fake_tool, anthropic_chat._run_tool
    try:
        return asyncio.run(anthropic_chat.run_chat_turn(
            None, System(name="zammad", slug="zammad"), "hello", list(history),
            client=client, config=config))
    finally:
        anthropic_chat._run_tool = original


def test_a_tool_call_cut_off_at_the_limit_is_not_run_and_the_model_is_told():
    client = FakeClient(reply("max_tokens", text("Applying:"), tool("t1")),
                        reply("end_turn", text("Done, in two smaller calls next time.")))
    final, events, new = run(client)
    assert final == "Done, in two smaller calls next time."
    roles = [m["role"] for m in new]
    assert roles == ["user", "assistant", "user", "assistant"]
    result = new[2]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "t1" and result["is_error"]
    assert "output limit" in result["content"]
    assert events[0]["output"]["error"].startswith("Not run")


def test_a_requested_tool_runs_and_the_turn_carries_on():
    ran = []
    client = FakeClient(reply("tool_use", tool("t1", input_={"name": "Zammad"})),
                        reply("end_turn", text("Renamed.")))
    final, events, new = run(client, ran=ran)
    assert ran == [("update_system_draft", {"name": "Zammad"})]
    assert final == "Renamed."
    assert json.loads(new[2]["content"][0]["content"]) == {"applied": {"name": "Zammad"}}


def test_a_conversation_left_on_an_unanswered_call_is_closed_by_appending():
    history = [
        {"role": "user", "content": [{"type": "text", "text": "document zammad"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "Applying"},
                                          {"type": "tool_use", "id": "old", "name": "update_system_draft", "input": {}}]},
    ]
    client = FakeClient(reply("end_turn", text("ok")))
    run(client, history=history)
    sent = client.requests[0]["messages"]
    assert sent[:2] == history                      # nothing before was touched
    opening = sent[2]
    assert opening["role"] == "user"
    assert opening["content"][0]["tool_use_id"] == "old" and opening["content"][0]["is_error"]
    assert opening["content"][-1] == {"type": "text", "text": "hello"}


def test_history_is_sent_back_exactly_as_it_was_stored():
    big = json.dumps({"result": ["x" * 2000]})
    history = [
        {"role": "user", "content": [{"type": "text", "text": "q1"}]},
        {"role": "assistant", "content": [{"type": "tool_use", "id": "s", "name": "search_palace", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "s", "content": big}]},
        {"role": "assistant", "content": [{"type": "text", "text": "a1"}]},
        {"role": "user", "content": [{"type": "text", "text": "q2"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "a2"}]},
    ]
    client = FakeClient(reply("end_turn", text("ok")))
    run(client, history=history)
    assert client.requests[0]["messages"][:len(history)] == history


def test_the_configured_model_limit_and_effort_reach_the_request():
    client = FakeClient(reply("end_turn", text("ok")))
    run(client)
    req = client.requests[0]
    assert (req["model"], req["max_tokens"], req["output_config"]) == ("claude-sonnet-5-5", 16000, {"effort": "medium"})


def test_a_model_that_takes_no_effort_is_not_sent_one():
    haiku = AssistantConfig(model="claude-haiku-4-5", api_key="k", max_output_tokens=16000,
                            effort="high", key_source="settings")
    client = FakeClient(reply("end_turn", text("ok")))
    run(client, config=haiku)
    assert "output_config" not in client.requests[0]


def test_running_out_of_rounds_says_so():
    client = FakeClient(*[reply("tool_use", tool(f"t{i}", name="search_palace")) for i in range(anthropic_chat.MAX_TOOL_ROUNDS)])
    final, _, new = run(client, ran=[])
    assert "Stopped after" in final
    assert new[-1]["role"] == "user"               # the last results are kept, unanswered by text

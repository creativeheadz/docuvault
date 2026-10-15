"""The assistant's providers, and the OpenAI-compatible chat loop.

2026-10-15: the settings page tested the *saved* model while showing another
one - the dropdown said Haiku, the toast said sonnet had answered - because
POST /assistant/test took no body. The test now takes what the page shows.
These also pin that each provider remembers its own model and key, that the
pre-2026-10-15 flat row still reads as Anthropic's, and that the DeepSeek /
IONOS / Muse path converts stored Anthropic blocks to Chat Completions and
stores its answers back in the same shape, so switching providers never
rewrites history.
"""
import asyncio
import base64
import json
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.core.encryption import encrypt  # noqa: E402
from app.models.system import System  # noqa: E402
from app.services import anthropic_chat, assistant_settings, openai_chat  # noqa: E402
from app.services.assistant_settings import AssistantConfig  # noqa: E402
from app.services.openai_client import ProviderError  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_keys(monkeypatch):
    for name in ("ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "IONOS_API_TOKEN", "MODEL_API_KEY"):
        monkeypatch.setattr(settings, name, "")


def _stored(plaintext: str) -> str:
    return base64.b64encode(encrypt(plaintext)).decode("ascii")


# ---- resolve_value: pure ----------------------------------------------------


def test_empty_settings_default_to_anthropic(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_MODEL", "")
    cfg = assistant_settings.resolve_value({})
    assert (cfg.provider, cfg.model, cfg.api_key, cfg.key_source) == \
        ("anthropic", assistant_settings.DEFAULT_MODEL, None, None)
    assert cfg.max_output_tokens == assistant_settings.DEFAULT_MAX_OUTPUT
    assert cfg.effort is None


def test_anthropic_model_env_is_honoured(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_MODEL", "claude-haiku-4-5")
    assert assistant_settings.resolve_value({}).model == "claude-haiku-4-5"


def test_legacy_flat_shape_reads_as_anthropics():
    cfg = assistant_settings.resolve_value({"model": "claude-sonnet-5-5", "api_key": _stored("k1")})
    assert (cfg.provider, cfg.model, cfg.api_key, cfg.key_source) == \
        ("anthropic", "claude-sonnet-5-5", "k1", "settings")


def test_each_provider_resolves_its_own_model_and_key(monkeypatch):
    monkeypatch.setattr(settings, "MODEL_API_KEY", "env-muse")
    value = {
        "provider": "muse",
        "models": {"anthropic": "claude-sonnet-5-5", "muse": "muse-spark-1.3"},
        "keys": {"anthropic": _stored("k-anthropic")},
    }
    cfg = assistant_settings.resolve_value(value)
    assert (cfg.provider, cfg.model, cfg.api_key, cfg.key_source) == \
        ("muse", "muse-spark-1.3", "env-muse", "environment")


def test_unknown_provider_falls_back_to_anthropic():
    cfg = assistant_settings.resolve_value({"provider": "hal-9000", "models": {"hal-9000": "m"}})
    assert cfg.provider == "anthropic"


def test_undecryptable_key_falls_back_to_the_environments(monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "env-ds")
    cfg = assistant_settings.resolve_value(
        {"provider": "deepseek", "keys": {"deepseek": "!!!not-base64!!!"}})
    assert (cfg.api_key, cfg.key_source) == ("env-ds", "environment")


def test_bad_effort_is_dropped():
    assert assistant_settings.resolve_value({"effort": "ultra"}).effort is None


def test_openai_routing():
    assert not assistant_settings.uses_openai_api("anthropic")
    assert assistant_settings.uses_openai_api("deepseek")
    assert assistant_settings.uses_openai_api("ionos")
    assert assistant_settings.uses_openai_api("muse")
    assert not assistant_settings.uses_openai_api("hal-9000")


# ---- save: per-provider memory, over a fake session -------------------------


class FakeResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class FakeSession:
    def __init__(self, value=None):
        self.row = NS(key="assistant", value=value) if value is not None else None

    async def execute(self, stmt):
        return FakeResult(self.row)

    def add(self, obj):
        self.row = obj

    async def flush(self):
        pass


def _save(db, **kw):
    params = {"provider": "anthropic", "model": "claude-sonnet-5-5", "api_key": None,
              "clear_key": False, "max_output_tokens": 16000, "effort": None}
    params.update(kw)
    return asyncio.run(assistant_settings.save(db, **params))


def test_save_roundtrip_keeps_each_providers_model_and_key():
    db = FakeSession()
    out = _save(db, provider="deepseek", model="deepseek-flash", api_key="k-ds")
    assert (out["provider"], out["model"], out["api_key_source"]) == ("deepseek", "deepseek-flash", "settings")
    out = _save(db, provider="anthropic", model="claude-haiku-5-5", api_key="k-an")
    assert (out["provider"], out["model"]) == ("anthropic", "claude-haiku-5-5")
    assert db.row.value["models"] == {"deepseek": "deepseek-flash", "anthropic": "claude-haiku-5-5"}
    assert sorted(db.row.value["keys"]) == ["anthropic", "deepseek"]
    cfg = assistant_settings.resolve_value(db.row.value)
    assert (cfg.provider, cfg.model, cfg.api_key) == ("anthropic", "claude-haiku-5-5", "k-an")


def test_save_folds_legacy_flat_fields_into_the_provider_shape():
    db = FakeSession({"model": "claude-sonnet-4-6", "api_key": _stored("k1")})
    _save(db, provider="deepseek", model="deepseek-flash")
    assert "model" not in db.row.value and "api_key" not in db.row.value
    assert db.row.value["models"]["anthropic"] == "claude-sonnet-4-6"
    cfg = assistant_settings.resolve_value({**db.row.value, "provider": "anthropic"})
    assert cfg.api_key == "k1"


def test_clear_key_only_forgets_the_active_provider():
    db = FakeSession()
    _save(db, provider="deepseek", model="deepseek-flash", api_key="k-ds")
    out = _save(db, provider="anthropic", model="claude-haiku-5-5", api_key="k-an")
    assert out["api_key_source"] == "settings"
    out = _save(db, provider="deepseek", model="deepseek-flash", clear_key=True)
    assert out["api_key_set"] is False
    assert sorted(db.row.value["keys"]) == ["anthropic"]


def test_save_rejects_an_unknown_provider():
    with pytest.raises(ValueError):
        _save(FakeSession(), provider="hal-9000", model="m")


# ---- test: the on-screen values are what gets answered ----------------------


class FakeAnthropicMessages:
    def __init__(self, outer):
        self.outer = outer

    async def create(self, **kwargs):
        self.outer.requests.append(kwargs)
        return NS(model=kwargs["model"], content=[NS(type="text", text="OK")])


class FakeAnthropic:
    def __init__(self, api_key, **kwargs):
        self.api_key = api_key
        self.requests = []
        self.messages = FakeAnthropicMessages(self)


class FakeOpenAI:
    made: list = []

    def __init__(self, base_url, api_key, **kwargs):
        self.base_url = base_url
        self.api_key = api_key
        self.requests = []
        FakeOpenAI.made.append(self)

    async def complete(self, payload):
        self.requests.append(payload)
        if isinstance(FakeOpenAI.reply, Exception):
            raise FakeOpenAI.reply
        return FakeOpenAI.reply


def _test(db, overrides=None):
    return asyncio.run(assistant_settings.test(db, overrides))


def test_the_test_answers_the_on_screen_model_not_the_saved_one(monkeypatch):
    db = FakeSession({"models": {"anthropic": "claude-sonnet-4-6"},
                      "keys": {"anthropic": _stored("k1")}})
    fake = FakeAnthropic("k1")
    monkeypatch.setattr(assistant_settings, "AsyncAnthropic", lambda api_key, **kw: fake)
    out = _test(db, {"provider": "anthropic", "model": "claude-haiku-5-5"})
    assert out["ok"] is True and out["model"] == "claude-haiku-5-5"
    assert fake.requests[0]["model"] == "claude-haiku-5-5"
    assert fake.api_key == "k1"
    assert db.row.value["models"] == {"anthropic": "claude-sonnet-4-6"}  # nothing stored


def test_a_typed_key_is_used_once_and_never_stored(monkeypatch):
    db = FakeSession({"provider": "deepseek", "models": {"deepseek": "deepseek-flash"},
                      "keys": {"deepseek": _stored("saved-key")}})
    FakeOpenAI.made.clear()
    FakeOpenAI.reply = {"model": "deepseek-flash",
                        "choices": [{"message": {"content": "OK"}}]}
    monkeypatch.setattr("app.services.openai_client.OpenAICompatClient", FakeOpenAI)
    out = _test(db, {"provider": "deepseek", "model": "deepseek-flash", "api_key": "typed-key"})
    assert out["ok"] is True
    assert FakeOpenAI.made[0].api_key == "typed-key"
    cfg = assistant_settings.resolve_value(db.row.value)
    assert cfg.api_key == "saved-key"


def test_without_overrides_the_saved_settings_are_tested(monkeypatch):
    db = FakeSession({"provider": "muse", "models": {"muse": "muse-spark-1.3"},
                      "keys": {"muse": _stored("k-muse")}})
    FakeOpenAI.made.clear()
    FakeOpenAI.reply = {"model": "muse-spark-1.3", "choices": [{"message": {"content": "OK"}}]}
    monkeypatch.setattr("app.services.openai_client.OpenAICompatClient", FakeOpenAI)
    out = _test(db, None)
    assert (out["ok"], out["provider"]) == (True, "muse")
    assert FakeOpenAI.made[0].base_url == "https://api.meta.ai/v1"
    assert FakeOpenAI.made[0].requests[0]["model"] == "muse-spark-1.3"


def test_an_unknown_model_is_reported_per_provider(monkeypatch):
    FakeOpenAI.reply = ProviderError(404, "The model `nope` does not exist")
    monkeypatch.setattr("app.services.openai_client.OpenAICompatClient", FakeOpenAI)
    out = _test(FakeSession(), {"provider": "ionos", "model": "nope", "api_key": "k"})
    assert out["ok"] is False
    assert "does not know the model 'nope'" in out["error"]
    assert "IONOS" in out["error"]


def test_no_key_anywhere_says_which_variable_to_set():
    out = _test(FakeSession(), {"provider": "deepseek", "model": "deepseek-flash"})
    assert out["ok"] is False
    assert out["error"] == "No DeepSeek API key: save one here or set DEEPSEEK_API_KEY"


def test_an_unknown_override_provider_is_an_error_not_a_crash():
    out = _test(FakeSession(), {"provider": "hal-9000"})
    assert out["ok"] is False and "Unknown provider" in out["error"]


# ---- to_openai_messages: stored blocks -> Chat Completions ------------------


def test_stored_turns_convert_with_answers_first_and_thinking_dropped():
    history = [
        {"role": "user", "content": [{"type": "text", "text": "document zammad"}]},
        {"role": "assistant", "content": [
            {"type": "thinking", "thinking": "let me think"},
            {"type": "text", "text": "Applying."},
            {"type": "tool_use", "id": "t1", "name": "update_system_draft", "input": {"name": "Z"}}]},
        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "t1", "content": "{\"applied\":{}}"}]},
    ]
    assert openai_chat.to_openai_messages(history) == [
        {"role": "user", "content": "document zammad"},
        {"role": "assistant", "content": "Applying.", "tool_calls": [
            {"id": "t1", "type": "function", "function": {
                "name": "update_system_draft", "arguments": '{"name": "Z"}'}}]},
        {"role": "tool", "tool_call_id": "t1", "content": "{\"applied\":{}}"},
    ]


def test_a_repair_plus_new_text_sends_the_answers_before_the_text():
    opening = {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "old", "is_error": True, "content": "{\"error\": \"x\"}"},
        {"type": "text", "text": "hello"}]}
    assert openai_chat.to_openai_messages([opening]) == [
        {"role": "tool", "tool_call_id": "old", "content": "{\"error\": \"x\"}"},
        {"role": "user", "content": "hello"},
    ]


# ---- the OpenAI-compatible tool loop, against a scripted stand-in -----------


def call(id_, name="update_system_draft", args=None):
    return {"id": id_, "type": "function", "function": {
        "name": name, "arguments": json.dumps(args if args is not None else {"body": "x"})}}


def completion(finish, text="", calls=(), model="deepseek-flash"):
    msg = {"content": text}
    if calls:
        msg["tool_calls"] = list(calls)
    return {"model": model, "choices": [{"finish_reason": finish, "message": msg}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5}}


class FakeClient:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests = []

    async def complete(self, payload):
        self.requests.append(json.loads(json.dumps(payload, default=str)))
        return self.replies.pop(0)


CONFIG = AssistantConfig(provider="deepseek", model="deepseek-flash", api_key="k",
                         max_output_tokens=16000, effort="high", key_source="settings")


def run(client, history=(), config=CONFIG, ran=None):
    async def fake_tool(db, system, palace, name, args):
        if ran is None:
            raise AssertionError(f"{name} should not have run")
        ran.append((name, args))
        return {"applied": args}

    anthropic_chat._run_tool, original = fake_tool, anthropic_chat._run_tool
    try:
        return asyncio.run(openai_chat.run_chat_turn(
            None, System(name="zammad", slug="zammad"), "hello", list(history),
            client=client, config=config))
    finally:
        anthropic_chat._run_tool = original


def test_a_requested_tool_runs_and_persists_anthropic_shaped_blocks():
    ran = []
    client = FakeClient(
        completion("tool_calls", "Renaming.", [call("c1", args={"name": "Zammad"})]),
        completion("stop", "Renamed."))
    final, events, new = run(client, ran=ran)
    assert ran == [("update_system_draft", {"name": "Zammad"})]
    assert final == "Renamed."
    assert [m["role"] for m in new] == ["user", "assistant", "user", "assistant"]
    used = new[1]["content"][1]
    assert (used["type"], used["id"], used["name"], used["input"]) == \
        ("tool_use", "c1", "update_system_draft", {"name": "Zammad"})
    result = new[2]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "c1"
    assert json.loads(result["content"]) == {"applied": {"name": "Zammad"}}
    assert new[1]["usage"] == {"model": "deepseek-flash", "input_tokens": 10, "output_tokens": 5}
    req = client.requests[0]
    assert (req["model"], req["max_tokens"]) == ("deepseek-flash", 16000)
    assert "output_config" not in req and "effort" not in json.dumps(req)
    assert req["messages"][0]["role"] == "system"
    assert {t["function"]["name"] for t in req["tools"]} == \
        {"search_palace", "read_palace_drawer", "update_system_draft"}


def test_tool_calls_cut_off_at_the_limit_are_not_run_and_the_model_is_told():
    client = FakeClient(
        completion("length", "Applying:", [call("c1")]),
        completion("stop", "Done, in two smaller calls next time."))
    final, events, new = run(client)
    assert final == "Done, in two smaller calls next time."
    assert [m["role"] for m in new] == ["user", "assistant", "user", "assistant"]
    result = new[2]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "c1" and result["is_error"]
    assert "output limit" in result["content"]
    assert events[0]["output"]["error"].startswith("Not run")


def test_a_plain_cut_off_reply_says_so():
    client = FakeClient(completion("length", "Half a write-up"))
    final, _, _ = run(client)
    assert final == "Half a write-up\n\n(The reply reached the output limit and was cut off.)"


def test_invalid_call_arguments_are_reported_not_run():
    bad = {"id": "c9", "type": "function",
           "function": {"name": "update_system_draft", "arguments": "{not json"}}
    client = FakeClient(completion("tool_calls", "", [bad]), completion("stop", "Retrying."))
    final, events, new = run(client)
    assert "not valid JSON" in events[0]["output"]["error"]
    assert json.loads(new[2]["content"][0]["content"])["error"]
    assert final == "Retrying."


def test_a_conversation_left_on_an_unanswered_call_is_closed_by_appending():
    history = [
        {"role": "user", "content": [{"type": "text", "text": "document zammad"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "Applying"},
                                          {"type": "tool_use", "id": "old",
                                           "name": "update_system_draft", "input": {}}]},
    ]
    client = FakeClient(completion("stop", "ok"))
    run(client, history=history)
    sent = client.requests[0]["messages"]
    assert sent[1] == {"role": "user", "content": "document zammad"}      # converted, untouched
    assert sent[2]["tool_calls"][0]["id"] == "old"
    assert sent[3]["role"] == "tool" and sent[3]["tool_call_id"] == "old"
    assert "ended before this call could run" in sent[3]["content"]
    assert sent[4] == {"role": "user", "content": "hello"}                # the new text, last
    assert history[1]["content"] == [
        {"type": "text", "text": "Applying"},
        {"type": "tool_use", "id": "old", "name": "update_system_draft", "input": {}}]


def test_running_out_of_rounds_says_so():
    client = FakeClient(*[completion("tool_calls", "", [call(f"c{i}", name="search_palace")])
                          for i in range(anthropic_chat.MAX_TOOL_ROUNDS)])
    final, _, new = run(client, ran=[])
    assert "Stopped after" in final
    assert new[-1]["role"] == "user"


def test_a_refusal_says_so():
    client = FakeClient({"model": "deepseek-flash",
                         "choices": [{"finish_reason": "refusal",
                                      "message": {"content": "", "refusal": "No."}}]})
    final, _, _ = run(client)
    assert final == "No."


def test_a_missing_key_names_the_provider():
    config = AssistantConfig(provider="ionos", model="m", api_key=None,
                             max_output_tokens=16000, effort=None, key_source=None)
    with pytest.raises(RuntimeError, match="IONOS"):
        asyncio.run(openai_chat.run_chat_turn(
            None, System(name="z", slug="z"), "hi", [], config=config))


def test_the_openai_loop_refuses_the_anthropic_provider():
    config = AssistantConfig(provider="anthropic", model="m", api_key="k",
                             max_output_tokens=16000, effort=None, key_source=None)
    with pytest.raises(RuntimeError, match="not an OpenAI-compatible provider"):
        asyncio.run(openai_chat.run_chat_turn(
            None, System(name="z", slug="z"), "hi", [], client=FakeClient(), config=config))

"""The outbound guard: which addresses this application will speak to.

These are the tests that matter most in the repo, because the thing they
describe is the difference between "an attacker who reaches a session can
read our documentation" and "an attacker who reaches a session can read our
RMM". They are pure - no sockets are opened - except where a name is
resolved, and the names used for that are the two that never change.
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.net_guard import (BlockedAddress, _is_public,  # noqa: E402
                                assert_public_url)
import ipaddress  # noqa: E402


def blocked(url: str) -> bool:
    try:
        asyncio.run(assert_public_url(url))
        return False
    except BlockedAddress:
        return True


# ── the address classifier ───────────────────────────────────────────────

@pytest.mark.parametrize("addr", [
    "127.0.0.1", "::1",                 # loopback
    "10.0.0.1", "172.16.0.1", "192.168.1.203",   # RFC1918 - our own estate
    "169.254.169.254",                  # cloud metadata, the prize
    "fd00::1",                          # unique-local v6
    "0.0.0.0", "255.255.255.255",
    "::ffff:192.168.1.40",              # v4 smuggled through a v6 wrapper
])
def test_unroutable_addresses_are_not_public(addr):
    assert _is_public(ipaddress.ip_address(addr)) is False


@pytest.mark.parametrize("addr", ["1.1.1.1", "81.150.150.132", "2606:4700::1111"])
def test_routable_addresses_are_public(addr):
    assert _is_public(ipaddress.ip_address(addr)) is True


# ── the URL gate ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8000/api/v1/organizations",
    "http://localhost/",
    "http://192.168.1.40/",
    "http://169.254.169.254/latest/meta-data/",
    "https://[::1]/",
    "ws://192.168.1.98:8765/",
])
def test_internal_targets_are_refused(url):
    assert blocked(url)


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "gopher://192.168.1.1/",
    "ftp://example.com/",
])
def test_only_http_and_websocket_schemes_are_allowed(url):
    assert blocked(url)


def test_a_url_with_no_host_is_refused():
    assert blocked("http:///nowhere")


def test_a_name_that_does_not_resolve_is_refused():
    assert blocked("https://this-name-does-not-exist.invalid/")


def test_a_public_name_is_allowed():
    asyncio.run(assert_public_url("https://one.one.one.one/"))


def test_the_allow_list_re_opens_a_specific_host(monkeypatch):
    """An operator who genuinely runs Uptime Kuma on the LAN says so once,
    by name, rather than by turning the guard off."""
    from app.config import settings
    assert blocked("http://192.168.1.82:3001/metrics")
    monkeypatch.setattr(settings, "OUTBOUND_ALLOWED_HOSTS", "192.168.1.82", raising=False)
    asyncio.run(assert_public_url("http://192.168.1.82:3001/metrics"))
    monkeypatch.setattr(settings, "OUTBOUND_ALLOWED_HOSTS", "", raising=False)
    assert blocked("http://192.168.1.82:3001/metrics")


def test_the_allow_list_does_not_leak_to_its_neighbours(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "OUTBOUND_ALLOWED_HOSTS", "192.168.1.82", raising=False)
    assert blocked("http://192.168.1.83:3001/metrics")

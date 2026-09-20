"""Stop a URL that arrived through the API from reaching our own network.

DocuVault makes outbound HTTP calls to addresses that a signed-in person
chooses: the Uptime Kuma instance, the MeshCentral server, the RDAP probe.
Left unguarded that is a server-side request forgery primitive, and the
network this application stands on is a more interesting target than the
internet - it holds the RMM, the secrets manager and the hypervisors. The
danger is not hypothetical the moment authentication is imperfect: an
attacker who reaches a session then reads `http://192.168.1.x` and
`http://169.254.169.254` *through* us.

The boundary drawn here is deliberately not "no internal addresses ever":

  * A URL that comes from the **environment** is the operator's own choice.
    Somebody who can set `MEMPALACE_URL` can already open a socket on the
    box; refusing to honour their config buys nothing and breaks a working
    feature. Those call sites use a plain client.
  * A URL that comes from the **database or a request** was chosen through
    the API, and must not resolve into private space unless an operator has
    named that host in `OUTBOUND_ALLOWED_HOSTS`.

Every redirect hop is checked, not just the first, because httpx fires the
request hook once per hop and an open redirector is otherwise a way around
the whole thing.

Known limit, stated rather than hidden: between our resolution and httpx's
own there is a window in which DNS could answer differently, so this does
not defeat a determined rebinding attack. Closing that means resolving
ourselves and connecting by address with an overridden SNI/Host, which costs
more than it buys against this threat model - the realistic attacker here
types `http://192.168.1.40` into a settings field.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
from urllib.parse import urlsplit

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ws/wss are here for MeshCentral, which connects with `websockets` rather
# than httpx but needs the same question answered about its target.
_ALLOWED_SCHEMES = {"http", "https", "ws", "wss"}
_DEFAULT_PORT = {"http": 80, "ws": 80, "https": 443, "wss": 443}

MAX_REDIRECTS = 5


class BlockedAddress(ValueError):
    """Raised instead of making a request we should not make."""


def _allowed_hosts() -> set[str]:
    raw = getattr(settings, "OUTBOUND_ALLOWED_HOSTS", "") or ""
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


def _is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """False for anything that is not a routable internet address.

    `is_private` already covers RFC1918, unique-local v6 and 127/8, but the
    others are listed explicitly because the cloud metadata endpoint
    (169.254.169.254) is link-local and is the single most valuable target
    an SSRF has.
    """
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        return False
    if ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        return False
    # An IPv4 address smuggled through a v6 wrapper resolves to the same host.
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        return _is_public(mapped)
    sixtofour = getattr(ip, "sixtofour", None)
    if sixtofour is not None:
        return _is_public(sixtofour)
    return True


async def _resolve(host: str, port: int) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        return [ipaddress.ip_address(host)]
    except ValueError:
        pass
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, proto=6)  # IPPROTO_TCP
    except OSError as exc:
        raise BlockedAddress(f"{host} does not resolve") from exc
    if not infos:
        raise BlockedAddress(f"{host} does not resolve")
    return [ipaddress.ip_address(info[4][0].split("%")[0]) for info in infos]


async def assert_public_url(url: str | httpx.URL) -> None:
    """Raise `BlockedAddress` unless every address behind `url` is routable.

    Every address, not the first one: a name that answers with one public
    and one private address would otherwise be a coin flip decided by
    whichever the connect happens to pick.
    """
    parts = urlsplit(str(url))
    scheme = (parts.scheme or "").lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise BlockedAddress(f"Refusing scheme '{parts.scheme}'")

    host = parts.hostname
    if not host:
        raise BlockedAddress("URL has no host")
    if host.lower() in _allowed_hosts():
        return

    try:
        port = parts.port or _DEFAULT_PORT[scheme]
    except ValueError as exc:                       # malformed port
        raise BlockedAddress(f"Invalid port in {url}") from exc

    for ip in await _resolve(host, port):
        if not _is_public(ip):
            raise BlockedAddress(
                f"{host} resolves to {ip}, which is not a public address. "
                f"Add it to OUTBOUND_ALLOWED_HOSTS if that is intended."
            )


async def _guard_hook(request: httpx.Request) -> None:
    await assert_public_url(request.url)


def guarded_client(**kwargs) -> httpx.AsyncClient:
    """An `httpx.AsyncClient` that refuses to talk to our own network.

    Use this for any URL that a person chose through the application. For a
    URL that came from the environment, use `httpx.AsyncClient` directly -
    see the module docstring for why that distinction is the real boundary.
    """
    hooks = dict(kwargs.pop("event_hooks", None) or {})
    hooks["request"] = list(hooks.get("request", [])) + [_guard_hook]
    kwargs.setdefault("max_redirects", MAX_REDIRECTS)
    return httpx.AsyncClient(event_hooks=hooks, **kwargs)

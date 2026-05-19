"""Registrar provider registry.

Add a provider here and it automatically appears in the settings UI and
the aggregated domain list — no other wiring needed.
"""

from app.services.registrars.base import (
    NormalizedDomain,
    RegistrarError,
    RegistrarProvider,
)
from app.services.registrars.cloudflare import CloudflareProvider
from app.services.registrars.godaddy import GoDaddyProvider
from app.services.registrars.ionos import IonosProvider

REGISTRY: dict[str, RegistrarProvider] = {
    p.key: p
    for p in (IonosProvider(), GoDaddyProvider(), CloudflareProvider())
}

__all__ = [
    "REGISTRY",
    "RegistrarProvider",
    "RegistrarError",
    "NormalizedDomain",
]

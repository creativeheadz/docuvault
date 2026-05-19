"""Registrar provider abstraction.

Each registrar (IONOS, GoDaddy, Cloudflare, …) implements `RegistrarProvider`:
it declares the credential fields it needs and knows how to list the
account's domains, normalised to a common shape.

Credentials are persisted per-provider in `app_settings` (see
`registrar_service`); secret fields are encrypted at rest.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CredField:
    """One credential input a provider needs from the user."""

    name: str
    label: str
    secret: bool = False
    optional: bool = False
    placeholder: str = ""

    def as_meta(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "secret": self.secret,
            "optional": self.optional,
            "placeholder": self.placeholder,
        }


@dataclass
class NormalizedDomain:
    """A domain as surfaced to the UI, identical across registrars."""

    name: str
    expiration_date: str | None = None  # ISO-8601 string, or None if unknown
    auto_renew: bool | None = None
    status: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "expiration_date": self.expiration_date,
            "auto_renew": self.auto_renew,
            "status": self.status,
        }


@dataclass
class DnsRecord:
    """A single DNS record, normalised across registrars."""

    name: str
    type: str
    content: str
    ttl: int | None = None
    prio: int | None = None
    disabled: bool = False
    id: str | None = None
    root_name: str | None = None
    change_date: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "content": self.content,
            "ttl": self.ttl,
            "prio": self.prio,
            "disabled": self.disabled,
            "root_name": self.root_name,
            "change_date": self.change_date,
        }


class RegistrarError(RuntimeError):
    """Raised by a provider when an API call fails in an expected way
    (bad credentials, HTTP error). Carries a human-readable message."""


class RegistrarProvider:
    """Base class. Subclasses set `key`, `label`, `fields` and implement
    `list_domains`."""

    key: str = ""
    label: str = ""
    fields: list[CredField] = field(default_factory=list)
    #: Whether this provider can list/mutate DNS records for its domains.
    supports_dns: bool = False

    def required_field_names(self) -> list[str]:
        return [f.name for f in self.fields if not f.optional]

    def secret_field_names(self) -> list[str]:
        return [f.name for f in self.fields if f.secret]

    def fields_meta(self) -> list[dict[str, Any]]:
        return [f.as_meta() for f in self.fields]

    async def list_domains(self, creds: dict[str, str]) -> list[NormalizedDomain]:
        raise NotImplementedError

    # --- Optional DNS capability (only if supports_dns) ---

    async def list_dns(
        self, creds: dict[str, str], domain: str
    ) -> list[DnsRecord]:
        raise NotImplementedError("This registrar does not expose DNS")

    async def create_dns(
        self, creds: dict[str, str], domain: str, record: dict[str, Any]
    ) -> None:
        raise NotImplementedError("This registrar does not expose DNS")

    async def update_dns(
        self,
        creds: dict[str, str],
        domain: str,
        record_id: str,
        record: dict[str, Any],
    ) -> None:
        raise NotImplementedError("This registrar does not expose DNS")

    async def delete_dns(
        self, creds: dict[str, str], domain: str, record_id: str
    ) -> None:
        raise NotImplementedError("This registrar does not expose DNS")

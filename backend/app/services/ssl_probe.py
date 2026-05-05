"""TLS probe — opens a connection to a host:port, reads the leaf certificate,
parses it with `cryptography`, and returns structured fields ready to be
written onto an SSLCertificate row.

Stays in stdlib + `cryptography` (already a dep). Probes run inside a
thread because Python's socket.create_connection / ssl.wrap_socket are
synchronous and we don't want to block the event loop.
"""

from __future__ import annotations

import asyncio
import socket
import ssl
from datetime import datetime, timezone
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import rsa, ec, ed25519, ed448
from cryptography.hazmat.primitives import hashes  # noqa: F401  (ensures hashes module loads)


def _name_attribute(name: x509.Name, oid: x509.ObjectIdentifier) -> str | None:
    attrs = name.get_attributes_for_oid(oid)
    return attrs[0].value if attrs else None


def _key_summary(public_key: Any) -> tuple[str | None, int | None]:
    """Return (algorithm, size_in_bits)."""
    if isinstance(public_key, rsa.RSAPublicKey):
        return "RSA", public_key.key_size
    if isinstance(public_key, ec.EllipticCurvePublicKey):
        return f"EC ({public_key.curve.name})", public_key.curve.key_size
    if isinstance(public_key, ed25519.Ed25519PublicKey):
        return "Ed25519", 256
    if isinstance(public_key, ed448.Ed448PublicKey):
        return "Ed448", 456
    return type(public_key).__name__, None


def _sans(cert: x509.Certificate) -> list[str]:
    try:
        ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
    except x509.ExtensionNotFound:
        return []
    out: list[str] = []
    for name in ext.value:
        if isinstance(name, x509.DNSName):
            out.append(name.value)
        elif isinstance(name, x509.IPAddress):
            out.append(str(name.value))
    return out


def _probe_sync(host: str, port: int, timeout: float = 8.0) -> dict[str, Any]:
    ctx = ssl.create_default_context()
    # We want the cert even if it's expired or self-signed — the user is
    # using this to *learn* the truth, not to enforce trust.
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    with socket.create_connection((host, port), timeout=timeout) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            der = tls.getpeercert(binary_form=True)
            cipher = tls.cipher()
            tls_version = tls.version()

    if not der:
        raise RuntimeError("server returned no certificate")

    cert = x509.load_der_x509_certificate(der)
    key_alg, key_size = _key_summary(cert.public_key())

    not_before = cert.not_valid_before_utc
    not_after = cert.not_valid_after_utc
    now = datetime.now(timezone.utc)

    return {
        "host": host,
        "port": port,
        "subject_cn": _name_attribute(cert.subject, x509.NameOID.COMMON_NAME),
        "issuer": _name_attribute(cert.issuer, x509.NameOID.COMMON_NAME)
                  or _name_attribute(cert.issuer, x509.NameOID.ORGANIZATION_NAME),
        "issuer_org": _name_attribute(cert.issuer, x509.NameOID.ORGANIZATION_NAME),
        "serial_number": format(cert.serial_number, "x"),
        "signature_algorithm": cert.signature_algorithm_oid._name,
        "key_algorithm": key_alg,
        "key_size": key_size,
        "sans": _sans(cert),
        "issued_date": not_before.date(),
        "expiration_date": not_after.date(),
        "not_before": not_before,
        "not_after": not_after,
        "is_expired": not_after < now,
        "days_until_expiry": (not_after - now).days,
        "tls_version": tls_version,
        "cipher": cipher[0] if cipher else None,
    }


async def probe_host(host: str, port: int = 443, timeout: float = 8.0) -> dict[str, Any]:
    """Async wrapper — runs the blocking probe in a thread."""
    return await asyncio.to_thread(_probe_sync, host, port, timeout)


def derive_host_from_common_name(common_name: str) -> str:
    """Wildcard certs (e.g. *.example.com) can't be probed as-is; strip the wildcard."""
    cn = (common_name or "").strip()
    if cn.startswith("*."):
        return cn[2:]
    return cn

"""Tiny DNS-lookup endpoint for the Configurations form auto-resolve."""

import asyncio
import socket

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/dns", tags=["dns"])


class DnsLookupResponse(BaseModel):
    hostname: str
    a: list[str]
    aaaa: list[str]


def _resolve(hostname: str) -> tuple[list[str], list[str]]:
    a: set[str] = set()
    aaaa: set[str] = set()
    try:
        for family, _type, _proto, _canon, sockaddr in socket.getaddrinfo(hostname, None):
            ip = sockaddr[0]
            if family == socket.AF_INET:
                a.add(ip)
            elif family == socket.AF_INET6:
                aaaa.add(ip.split("%")[0])  # strip zone id
    except socket.gaierror as e:
        raise HTTPException(status_code=502, detail=f"DNS lookup failed: {e}")
    return sorted(a), sorted(aaaa)


@router.get("/lookup", response_model=DnsLookupResponse)
async def dns_lookup(
    hostname: str = Query(..., min_length=1, max_length=253),
    _: User = Depends(get_current_user),
):
    a, aaaa = await asyncio.to_thread(_resolve, hostname)
    return DnsLookupResponse(hostname=hostname, a=a, aaaa=aaaa)

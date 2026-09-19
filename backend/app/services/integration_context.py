"""What another system is allowed to read out of DocuVault, and in what shape.

This service exists because the consumer is a language model, not a browser,
and the two want opposite things. The React app wants normalised rows it can
render into forms. A model wants prose it can quote, with enough structure to
say WHERE a sentence came from and a date so it can tell the operator how old
the claim is.

So the unit here is not a table row, it is an `item`:

    {kind, title, text, updated_at, path}

`kind` is what sort of documentation this is (a runbook, a system record, an
operator's note on a machine). `path` is where it lives in the DocuVault UI,
relative, so the caller can turn it into a link for the human reading the
answer. Documentation with no way back to the page that holds it is a
paraphrase, and a paraphrase is what the operator will be asked to act on.

Three rules the whole module obeys:

  * **No credentials, ever.** Nothing here touches `passwords`. Not the
    metadata, not the category, not the count. The route this serves is
    reachable by a machine token and the answer it produces is going to a
    third-party model; a password field that is merely "not selected today"
    is one refactor away from being selected.
  * **Bounded output.** Every text is truncated and every list is capped. An
    organisation with four hundred documents must not be able to turn one
    chat answer into a hundred-thousand-token request, and the caller cannot
    know the size in advance. `truncated` says when something was dropped so
    the model can say so rather than answering confidently from a slice.
  * **Archived is invisible.** Every model here carries `archived_at`, and an
    archived record is something a person deliberately took out of use.
    Feeding it to an AI that then recommends it is worse than not having it.
"""
from __future__ import annotations

import uuid
from typing import Any, Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.configuration import Configuration
from app.models.contact import Contact
from app.models.document import Document
from app.models.organization import Organization
from app.models.relationship import Relationship
from app.models.runbook import Runbook, RunbookStep
from app.models.system import System

# Per-item character ceiling. Generous enough for a real runbook step and a
# system's body, small enough that forty of them is still a sane prompt.
TEXT_LIMIT = 1500
# Total items in one bundle.
ITEM_LIMIT = 40

# Relationship rows are free text on both sides (the table takes any string),
# so a lookup that insists on one spelling silently returns nothing the first
# time somebody writes "systems". Match a small alias set in both directions
# and move on; being strict here buys nothing and costs the whole feature.
_SYSTEM_TYPES = ("system", "systems")
_CONFIG_TYPES = ("configuration", "configurations", "device", "devices")
_ORG_TYPES = ("organization", "organizations", "organisation", "organisations")


def flatten_richtext(content: Any) -> str:
    """Plain text out of a TipTap/ProseMirror JSONB document.

    `documents.content` and `runbook_steps.content` are editor models, not
    text: a tree of nodes where the words live in `text` leaves. Handing that
    JSON to a model wastes most of the tokens on `{"type":"paragraph"}` and
    reads badly when quoted back to a person.

    Block-level nodes become line breaks so a list of steps survives as a
    list of steps. Anything unrecognised is walked rather than dropped -
    a node type added by a future editor upgrade should cost formatting, not
    content.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return "\n".join(p for p in (flatten_richtext(c) for c in content) if p)
    if not isinstance(content, dict):
        return ""

    if content.get("type") == "text":
        return str(content.get("text") or "")

    inner = flatten_richtext(content.get("content"))
    block = content.get("type") in (
        "paragraph", "heading", "listItem", "blockquote", "codeBlock",
        "bulletList", "orderedList", "tableRow", "doc")
    return f"{inner}\n" if (block and inner) else inner


def _clip(text: str, limit: int = TEXT_LIMIT) -> tuple[str, bool]:
    """Text cut to `limit`, and whether it was cut. Cuts on a word boundary."""
    text = " ".join((text or "").split()) if "\n" not in (text or "") else (text or "").strip()
    if len(text) <= limit:
        return text, False
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit * 0.7:
        cut = cut[:space]
    return cut.rstrip() + " ...", True


def _item(kind: str, title: str, text: str, updated_at, path: str) -> dict:
    clipped, was_cut = _clip(text)
    return {
        "kind": kind,
        "title": title or "Untitled",
        "text": clipped,
        "updated_at": updated_at.isoformat() if updated_at is not None else None,
        "path": path,
        "clipped": was_cut,
    }


async def _related_system_ids(db: AsyncSession, entity_ids: Iterable[uuid.UUID]) -> list[uuid.UUID]:
    """System ids linked to any of these entities, either way round.

    Systems have no organisation column - they are a tenant-wide catalogue,
    by design, because "our Microsoft 365 tenancy" is not owned by one client.
    The link to a client or a machine is a relationship row, so that is where
    this has to look.
    """
    ids = [i for i in entity_ids if i]
    if not ids:
        return []
    forward = select(Relationship.target_id).where(
        Relationship.source_id.in_(ids),
        func.lower(Relationship.target_type).in_(_SYSTEM_TYPES))
    backward = select(Relationship.source_id).where(
        Relationship.target_id.in_(ids),
        func.lower(Relationship.source_type).in_(_SYSTEM_TYPES))
    rows = (await db.execute(forward.union(backward))).all()
    return [r[0] for r in rows]


async def match_configuration(db: AsyncSession, organization_id, hostname=None,
                              serial=None, name=None) -> Configuration | None:
    """The documented machine behind a Wegweiser device, or None.

    Ordered by how much a match is worth believing. Serial is a hardware
    fact and nothing else has it, so it wins outright. Hostname is next but
    must be compared short-form as well: DocuVault rows imported from
    MeshCentral carry `workstation-04` while the agent reports
    `workstation-04.clients.local`, and an exact-only comparison misses every
    domain-joined machine in the estate.

    IP address is deliberately NOT a matcher. Every configuration synced from
    MeshCentral carries the site's NAT address rather than the machine's, so
    matching on it would map every device at a client to whichever row
    happened to sort first.
    """
    base = select(Configuration).where(
        Configuration.archived_at.is_(None))
    if organization_id:
        base = base.where(Configuration.organization_id == organization_id)

    serial = (serial or "").strip()
    if serial:
        row = (await db.execute(base.where(
            func.lower(Configuration.serial_number) == serial.lower()))).scalars().first()
        if row is not None:
            return row

    hostname = (hostname or "").strip()
    if hostname:
        short = hostname.split(".")[0]
        row = (await db.execute(base.where(or_(
            func.lower(Configuration.hostname) == hostname.lower(),
            func.lower(Configuration.hostname) == short.lower(),
            func.lower(Configuration.name) == hostname.lower(),
            func.lower(Configuration.name) == short.lower(),
        )))).scalars().first()
        if row is not None:
            return row

    name = (name or "").strip()
    if name:
        row = (await db.execute(base.where(
            func.lower(Configuration.name) == name.lower()))).scalars().first()
        if row is not None:
            return row
    return None


def _configuration_item(cfg: Configuration) -> dict | None:
    """A machine's own record as one readable block, or None if it says nothing.

    The operator's note is the valuable half and the identity fields are
    context for it. A configuration with no note, no role and no warranty
    date tells a model nothing it did not already know from telemetry, and
    an empty item still costs tokens and still looks like evidence.
    """
    facts = []
    if cfg.configuration_type:
        facts.append(f"Type: {cfg.configuration_type}")
    if cfg.device_role:
        facts.append(f"Role: {cfg.device_role}")
    if cfg.manufacturer or cfg.model:
        facts.append(f"Hardware: {' '.join(x for x in (cfg.manufacturer, cfg.model) if x)}")
    if cfg.warranty_expiration:
        facts.append(f"Warranty expires: {cfg.warranty_expiration}")
    if cfg.os_eol_date:
        facts.append(f"OS end of life: {cfg.os_eol_date}")
    if cfg.last_patched_date:
        facts.append(f"Last patched (documented): {cfg.last_patched_date}")
    if cfg.ce_in_scope is False:
        facts.append("Marked out of scope for Cyber Essentials")
    note = (cfg.notes or "").strip()
    if not facts and not note:
        return None
    body = "\n".join(facts)
    if note:
        body = f"{body}\n\nOperator note:\n{note}" if body else f"Operator note:\n{note}"
    return _item("machine record", cfg.name, body, cfg.updated_at,
                 f"/configurations/{cfg.id}")


async def _systems_items(db: AsyncSession, system_ids) -> list[dict]:
    if not system_ids:
        return []
    rows = (await db.execute(select(System).where(
        System.id.in_(list(system_ids)),
        System.archived_at.is_(None)))).scalars().all()
    items = []
    for sysrec in rows:
        parts = []
        if sysrec.short_description:
            parts.append(sysrec.short_description)
        if sysrec.body:
            parts.append(sysrec.body)
        if sysrec.snippets:
            # Snippets are the operator's own key/value crib: "backup window",
            # "licence renewal". Flattened rather than dropped because they
            # are usually the most specific thing in the record.
            parts.append("\n".join(f"{k}: {v}" for k, v in sysrec.snippets.items() if v))
        text = "\n\n".join(p for p in parts if p)
        if not text:
            continue
        items.append(_item("system", sysrec.name, text, sysrec.updated_at,
                           f"/systems/{sysrec.slug}"))
    return items


async def _runbook_items(db: AsyncSession, organization_id, limit=10) -> list[dict]:
    rows = (await db.execute(select(Runbook).where(
        Runbook.organization_id == organization_id,
        Runbook.archived_at.is_(None)).order_by(
            Runbook.updated_at.desc()).limit(limit))).scalars().all()
    items = []
    for rb in rows:
        steps = (await db.execute(select(RunbookStep).where(
            RunbookStep.runbook_id == rb.id).order_by(
                RunbookStep.step_number))).scalars().all()
        body = (rb.description or "").strip()
        lines = [f"{s.step_number}. {s.title}" +
                 (f"\n   {flatten_richtext(s.content).strip()}" if s.content else "")
                 for s in steps]
        text = "\n\n".join(x for x in (body, "\n".join(lines)) if x.strip())
        if not text.strip():
            continue
        items.append(_item("runbook", rb.name, text, rb.updated_at,
                           f"/runbooks/{rb.id}"))
    return items


async def _document_items(db: AsyncSession, organization_id, limit=10) -> list[dict]:
    rows = (await db.execute(select(Document).where(
        Document.organization_id == organization_id,
        Document.archived_at.is_(None)).order_by(
            Document.updated_at.desc()).limit(limit))).scalars().all()
    items = []
    for doc in rows:
        text = flatten_richtext(doc.content).strip()
        if not text:
            continue
        items.append(_item("document", doc.title, text, doc.updated_at,
                           f"/documents/{doc.id}"))
    return items


async def _contact_item(db: AsyncSession, organization_id) -> dict | None:
    """Who to ring, as one block rather than one item per person.

    This is the single most actionable thing in a documentation platform and
    the thing telemetry can never supply. It is one item because a chat
    answer wants "here is the escalation path", not eight cards.
    """
    rows = (await db.execute(select(Contact).where(
        Contact.organization_id == organization_id,
        Contact.archived_at.is_(None)).order_by(
            Contact.is_primary.desc(), Contact.last_name).limit(12))).scalars().all()
    if not rows:
        return None
    lines = []
    for c in rows:
        who = " ".join(x for x in (c.first_name, c.last_name) if x)
        bits = [x for x in (c.title, c.email, c.phone or c.mobile) if x]
        mark = " (primary contact)" if c.is_primary else ""
        lines.append(f"{who}{mark}" + (f" - {', '.join(bits)}" if bits else ""))
    latest = max((c.updated_at for c in rows if c.updated_at), default=None)
    return _item("contacts", "Who to contact", "\n".join(lines), latest,
                 f"/organizations/{organization_id}")


async def organization_context(db: AsyncSession, organization_id, hostname=None,
                               serial=None, device_name=None) -> dict:
    """Everything documented about one client, optionally focused on one machine.

    Order matters and is not alphabetical: the caller truncates from the end,
    so the list runs most specific first. The machine's own record and the
    systems attached to it beat the client's general documentation, because
    a question asked on a device page is a question about that device.
    """
    org = (await db.execute(select(Organization).where(
        Organization.id == organization_id,
        Organization.archived_at.is_(None)))).scalars().first()
    if org is None:
        return {"found": False, "organization": None, "items": [], "truncated": False}

    cfg = await match_configuration(db, organization_id, hostname, serial, device_name)

    items: list[dict] = []
    related_ids = [organization_id] + ([cfg.id] if cfg is not None else [])
    if cfg is not None:
        cfg_item = _configuration_item(cfg)
        if cfg_item:
            items.append(cfg_item)
        # Systems attached to this machine specifically, before the client's.
        items.extend(await _systems_items(db, await _related_system_ids(db, [cfg.id])))

    seen = {i["path"] for i in items}
    for item in await _systems_items(db, await _related_system_ids(db, [organization_id])):
        if item["path"] not in seen:
            items.append(item)
            seen.add(item["path"])

    items.extend(await _runbook_items(db, organization_id))
    items.extend(await _document_items(db, organization_id))
    contacts = await _contact_item(db, organization_id)
    if contacts:
        items.append(contacts)

    if (org.description or "").strip():
        items.append(_item("client note", org.name, org.description,
                           org.updated_at, f"/organizations/{org.id}"))

    truncated = len(items) > ITEM_LIMIT
    return {
        "found": True,
        "organization": {"id": str(org.id), "name": org.name,
                         "path": f"/organizations/{org.id}"},
        "matched_configuration": None if cfg is None else {
            "id": str(cfg.id), "name": cfg.name, "hostname": cfg.hostname,
            "serial_number": cfg.serial_number,
            "mesh_node_id": cfg.mesh_node_id,
            "path": f"/configurations/{cfg.id}"},
        "items": items[:ITEM_LIMIT],
        "truncated": truncated,
    }


async def search_context(db: AsyncSession, query: str, organization_ids=None,
                         limit: int = 12) -> dict:
    """Documentation matching free text, across systems, runbooks and documents.

    Deliberately a LIKE over titles and bodies rather than anything cleverer.
    DocuVault has no full-text index today and adding one is a schema change
    with an ongoing cost; the corpus in a single MSP's instance is thousands
    of rows, not millions, and a sequential scan on that answers in
    milliseconds. When it stops being true, this is the one function to
    change.
    """
    q = (query or "").strip()
    if len(q) < 2:
        return {"items": [], "truncated": False}
    like = f"%{q}%"
    items: list[dict] = []

    sys_rows = (await db.execute(select(System).where(
        System.archived_at.is_(None),
        or_(System.name.ilike(like), System.short_description.ilike(like),
            System.body.ilike(like))).limit(limit))).scalars().all()
    for s in sys_rows:
        text = "\n\n".join(p for p in (s.short_description, s.body) if p)
        items.append(_item("system", s.name, text, s.updated_at, f"/systems/{s.slug}"))

    rb_q = select(Runbook).where(
        Runbook.archived_at.is_(None),
        or_(Runbook.name.ilike(like), Runbook.description.ilike(like)))
    doc_q = select(Document).where(
        Document.archived_at.is_(None), Document.title.ilike(like))
    if organization_ids:
        rb_q = rb_q.where(Runbook.organization_id.in_(list(organization_ids)))
        doc_q = doc_q.where(Document.organization_id.in_(list(organization_ids)))

    for rb in (await db.execute(rb_q.limit(limit))).scalars().all():
        items.append(_item("runbook", rb.name, rb.description or "",
                           rb.updated_at, f"/runbooks/{rb.id}"))
    for doc in (await db.execute(doc_q.limit(limit))).scalars().all():
        items.append(_item("document", doc.title, flatten_richtext(doc.content),
                           doc.updated_at, f"/documents/{doc.id}"))

    return {"items": items[:ITEM_LIMIT], "truncated": len(items) > ITEM_LIMIT}

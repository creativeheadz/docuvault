"""A key that may write tasks, and the two things it must never become.

`write:tasks` exists so a coding assistant can keep a product roadmap in the
tasks list without a person's session. These tests pin down the three
properties that make that safe: a key is refused by any router that asked
for a different scope, a key narrowed to an organisation sees nothing
outside it, and no route that could reach a password accepts a key at all.
The last one is checked against the real routing table, not against a list
somebody has to remember to update.
"""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.v1.router import api_router                              # noqa: E402
from app.api.v1.tasks import TaskActor, task_actor                    # noqa: E402
from app.core import api_auth                                         # noqa: E402
from app.core.api_auth import assert_scope, require_scope, require_token  # noqa: E402
from app.core.dependencies import get_current_user                    # noqa: E402
from app.models.api_token import (ApiToken, SCOPE_READ_CONTEXT,       # noqa: E402
                                  SCOPE_WRITE_TASKS, VALID_SCOPES)
from app.models.task import Task                                      # noqa: E402

ORG_A = uuid.UUID('11111111-1111-1111-1111-111111111111')
ORG_B = uuid.UUID('22222222-2222-2222-2222-222222222222')


def _key(scopes, orgs=()):
    return ApiToken(name='t', prefix='p', token_hash='h',
                    scopes=list(scopes), organization_ids=list(orgs))


# ── scopes ───────────────────────────────────────────────────────────────

def test_both_scopes_are_known_and_distinct():
    assert SCOPE_READ_CONTEXT in VALID_SCOPES
    assert SCOPE_WRITE_TASKS in VALID_SCOPES
    assert SCOPE_READ_CONTEXT != SCOPE_WRITE_TASKS


def test_a_documentation_key_cannot_write_tasks():
    """The key Wegweiser holds must not become a roadmap editor because a
    second scope was added later."""
    with pytest.raises(HTTPException) as e:
        assert_scope(_key([SCOPE_READ_CONTEXT]), SCOPE_WRITE_TASKS)
    assert e.value.status_code == 403


def test_a_tasks_key_cannot_read_documentation():
    """And the other way round: the roadmap key reads no client notes."""
    with pytest.raises(HTTPException) as e:
        assert_scope(_key([SCOPE_WRITE_TASKS]), SCOPE_READ_CONTEXT)
    assert e.value.status_code == 403


def test_a_key_with_both_scopes_passes_both():
    both = _key([SCOPE_READ_CONTEXT, SCOPE_WRITE_TASKS])
    assert_scope(both, SCOPE_READ_CONTEXT)
    assert_scope(both, SCOPE_WRITE_TASKS)


def test_require_token_still_means_read_context():
    """The integration router kept its dependency name. It must still ask
    for the scope it always asked for."""
    assert require_token.__name__ == 'require_read_context'
    assert require_scope(SCOPE_WRITE_TASKS).__name__ == 'require_write_tasks'


# ── liveness ─────────────────────────────────────────────────────────────

NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


def test_a_live_key_is_not_rejected():
    assert _key([SCOPE_WRITE_TASKS]).rejection(NOW) is None


def test_a_revoked_key_is_rejected_whatever_else_is_true():
    k = _key([SCOPE_WRITE_TASKS])
    k.revoked_at = NOW - timedelta(days=1)
    k.expires_at = NOW + timedelta(days=365)
    assert 'revoked' in k.rejection(NOW)


def test_an_expired_key_is_rejected_and_one_about_to_expire_is_not():
    k = _key([SCOPE_WRITE_TASKS])
    k.expires_at = NOW
    assert 'expired' in k.rejection(NOW)
    k.expires_at = NOW + timedelta(seconds=1)
    assert k.rejection(NOW) is None


# ── what a caller may see ────────────────────────────────────────────────

def test_a_person_sees_every_task():
    actor = TaskActor(user=object())
    assert actor.narrowed_to is None
    assert actor.allows_organization(ORG_A)
    assert actor.allows_organization(None)


def test_an_unnarrowed_key_sees_every_task():
    actor = TaskActor(token=_key([SCOPE_WRITE_TASKS]))
    assert actor.narrowed_to is None
    assert actor.allows_organization(ORG_B)
    assert actor.allows_organization(None)


def test_a_narrowed_key_sees_only_its_organisation():
    actor = TaskActor(token=_key([SCOPE_WRITE_TASKS], orgs=[ORG_A]))
    assert actor.narrowed_to == [ORG_A]
    assert actor.allows_organization(ORG_A)
    assert actor.allows_organization(str(ORG_A))
    assert not actor.allows_organization(ORG_B)


def test_a_narrowed_key_cannot_see_tasks_that_belong_to_nobody():
    """A task with no organisation is the general list. A key minted for one
    product's roadmap has no business there, in either direction."""
    actor = TaskActor(token=_key([SCOPE_WRITE_TASKS], orgs=[ORG_A]))
    assert not actor.allows_organization(None)
    assert not actor.may_see(Task(title='x', organization_id=None))
    assert actor.may_see(Task(title='x', organization_id=ORG_A))
    assert not actor.may_see(Task(title='x', organization_id=ORG_B))


# ── the routing table ────────────────────────────────────────────────────

def _calls(dependant) -> set:
    out = set()
    for d in dependant.dependencies:
        out.add(d.call)
        out |= _calls(d)
    return out


def _accepts_a_key(fn) -> bool:
    return fn is task_actor or getattr(fn, '__module__', '') == api_auth.__name__


def _flatten(router, prefix=''):
    """Every APIRoute under `router` with its effective path, whichever way
    this FastAPI version stores an included router: copied in eagerly, or
    (0.120+) kept as an include record that carries the sub-router and the
    prefix it was included under."""
    for r in router.routes:
        if isinstance(r, APIRoute):
            yield prefix + r.path, r
        elif hasattr(r, 'original_router'):
            sub = getattr(getattr(r, 'include_context', None), 'prefix', '') or ''
            yield from _flatten(r.original_router, prefix + sub)


def _routes():
    return list(_flatten(api_router))


def test_the_routing_table_is_not_empty():
    paths = [p for p, _ in _routes()]
    assert len(paths) > 50
    assert '/api/v1/tasks' in paths
    assert '/api/v1/integration/whoami' in paths


def test_only_tasks_and_integration_accept_a_key():
    """The guarantee in `ApiToken`'s docstring, checked against the app
    rather than promised: outside these two routers, no route depends on
    anything that would accept an X-API-Key."""
    strays = []
    for path, r in _routes():
        if path.startswith('/api/v1/tasks') or path.startswith('/api/v1/integration'):
            continue
        if any(_accepts_a_key(fn) for fn in _calls(r.dependant)):
            strays.append(f'{sorted(r.methods)} {path}')
    assert strays == []


def test_every_tasks_route_goes_through_the_actor_and_not_a_bare_user():
    tasks = [(p, r) for p, r in _routes() if p.startswith('/api/v1/tasks')]
    assert len(tasks) == 5, [p for p, _ in tasks]
    for path, r in tasks:
        calls = _calls(r.dependant)
        assert task_actor in calls, path
        assert get_current_user not in calls, path


def test_revealing_a_password_still_takes_a_person():
    reveal = [(p, r) for p, r in _routes() if 'reveal' in p]
    assert reveal, 'no reveal route found - the test would prove nothing'
    for path, r in reveal:
        calls = _calls(r.dependant)
        assert get_current_user in calls, path
        assert not any(_accepts_a_key(fn) for fn in calls), path

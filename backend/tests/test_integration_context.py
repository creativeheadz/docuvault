"""The integration read API: what it turns documentation into, and what it will
not hand out.

DocuVault has had no test suite, and the first thing that genuinely needs one
is this module, because it is the first code here that answers to a machine
rather than to a signed-in person. These cover the pure functions only - no
database, no event loop - so they run anywhere with `pytest backend/tests`.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.api_token import generate_token, hash_token       # noqa: E402
from app.models.api_token import ApiToken, TOKEN_PREFIX            # noqa: E402
from app.services.integration_context import (ITEM_LIMIT, TEXT_LIMIT,  # noqa: E402
                                              _clip, flatten_richtext)


# ── the credential ───────────────────────────────────────────────────────

def test_a_generated_token_is_recognisable_and_long():
    raw, prefix, digest = generate_token()
    assert raw.startswith(TOKEN_PREFIX)
    assert prefix == raw[:12]
    assert len(digest) == 64
    assert len(raw) == len(TOKEN_PREFIX) + 64


def test_two_tokens_are_never_the_same():
    assert generate_token()[0] != generate_token()[0]


def test_the_prefix_cannot_authenticate():
    """The prefix exists so a person can tell two keys apart in a list and
    revoke the right one. It must not be enough to sign in with."""
    raw, prefix, digest = generate_token()
    assert hash_token(prefix) != digest


def test_a_token_with_no_organisations_sees_them_all():
    """Empty is the sensible default for a single-tenant instance, and it is
    a deliberate meaning rather than an absence."""
    token = ApiToken(name='t', prefix='p', token_hash='h', scopes=[],
                     organization_ids=[])
    assert token.allows_organization('11111111-1111-1111-1111-111111111111')


def test_a_narrowed_token_sees_only_its_own():
    """An MSP integrating one client's tenant should not have to hand over a
    key that reads every client they document."""
    mine = '11111111-1111-1111-1111-111111111111'
    theirs = '22222222-2222-2222-2222-222222222222'
    token = ApiToken(name='t', prefix='p', token_hash='h', scopes=[],
                     organization_ids=[mine])
    assert token.allows_organization(mine)
    assert not token.allows_organization(theirs)


# ── turning an editor document into something quotable ───────────────────

def test_a_tiptap_document_becomes_its_words():
    """`documents.content` is an editor model, not text. Handed to a model
    raw, most of the tokens are `{"type":"paragraph"}` and the quote back to
    a person reads like JSON."""
    doc = {'type': 'doc', 'content': [
        {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Stop the service.'}]},
        {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Clear the archive.'}]},
    ]}
    out = flatten_richtext(doc)
    assert 'Stop the service.' in out
    assert 'Clear the archive.' in out
    assert 'paragraph' not in out


def test_an_unknown_node_costs_formatting_not_content():
    """A node type added by a future editor upgrade must not silently delete
    the words inside it."""
    doc = {'type': 'doc', 'content': [
        {'type': 'someFutureThing',
         'content': [{'type': 'text', 'text': 'still here'}]}]}
    assert 'still here' in flatten_richtext(doc)


@pytest.mark.parametrize('value', [None, '', [], {}, 42])
def test_nothing_shaped_wrongly_raises(value):
    """This runs inside a chat answer. A malformed document is a reason for a
    thinner answer, never an exception."""
    assert isinstance(flatten_richtext(value), str)


def test_plain_text_survives_unchanged():
    assert flatten_richtext('  already text  ') == 'already text'


# ── bounded output ───────────────────────────────────────────────────────

def test_a_long_note_is_cut_and_says_so():
    """An organisation with four hundred documents must not be able to turn
    one chat answer into a hundred-thousand-token request, and the caller
    cannot know the size in advance."""
    text, cut = _clip('word ' * 2000)
    assert cut is True
    assert len(text) <= TEXT_LIMIT + 4
    assert text.endswith('...')


def test_a_short_note_is_left_alone():
    text, cut = _clip('Ring Dave first.')
    assert cut is False
    assert text == 'Ring Dave first.'


def test_the_caps_are_sane():
    assert 0 < ITEM_LIMIT <= 100
    assert 200 <= TEXT_LIMIT <= 8000

"""The rules a saved network map must keep.

The editor enforces the same rules as you draw, so these are the backstop:
whatever a client sends, a map never ends up pointing at another
organisation's records, never gives a device two gateways, and never lets
the chain of gateways loop (auto-layout walks it as a tree).
"""
import sys
import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.network_map import GraphSave, MapLink, MapNode, MapZone  # noqa: E402
from app.services.network_map_service import GraphError, validate_graph  # noqa: E402

RECORD_A = uuid.uuid4()
RECORD_B = uuid.uuid4()
OURS = {RECORD_A, RECORD_B}


def node(kind='switch', record=None):
    return MapNode(id=uuid.uuid4(), kind=kind, system_id=record, x=0, y=0)


def link(a, b, role='peer', kind='ethernet'):
    return MapLink(id=uuid.uuid4(), source_node_id=a.id, target_node_id=b.id, role=role, kind=kind)


def zone(tone='neutral'):
    return MapZone(id=uuid.uuid4(), label='DMZ', x=0, y=0, width=100, height=100, tone=tone)


def check(nodes=(), links=(), zones=(), allowed=OURS):
    validate_graph(nodes, links, zones, allowed)


# ── a well-formed map ────────────────────────────────────────────────────

def test_a_tree_with_peer_links_and_zones_is_accepted():
    wan, fw, core, sw1, sw2 = node('internet'), node('firewall', RECORD_A), node('switch'), node(), node()
    check(
        [wan, fw, core, sw1, sw2],
        [
            link(fw, wan, 'uplink', 'wan'),
            link(core, fw, 'uplink', 'fibre'),
            link(sw1, core, 'uplink'),
            link(sw2, core, 'uplink', 'trunk'),
            link(sw1, sw2, 'peer'),          # a lateral link is not a gateway
            link(sw1, sw2, 'peer', 'fibre'),  # and two of them may run in parallel
        ],
        [zone('ember')],
    )


def test_an_empty_map_is_accepted():
    check()


# ── gateways ─────────────────────────────────────────────────────────────

def test_a_device_has_at_most_one_gateway():
    a, b, c = node(), node(), node()
    with pytest.raises(GraphError, match='one gateway'):
        check([a, b, c], [link(a, b, 'uplink'), link(a, c, 'uplink')])


def test_gateways_may_not_loop():
    a, b, c = node(), node(), node()
    with pytest.raises(GraphError, match='circle'):
        check([a, b, c], [link(a, b, 'uplink'), link(b, c, 'uplink'), link(c, a, 'uplink')])


def test_two_devices_may_not_be_each_others_gateway():
    a, b = node(), node()
    with pytest.raises(GraphError, match='circle'):
        check([a, b], [link(a, b, 'uplink'), link(b, a, 'uplink')])


def test_a_loop_of_peer_links_is_fine():
    a, b, c = node(), node(), node()
    check([a, b, c], [link(a, b), link(b, c), link(c, a)])


def test_a_long_chain_is_walked_without_mistaking_shared_ancestors_for_a_loop():
    root = node('internet')
    chain = [node() for _ in range(300)]
    links = [link(chain[0], root, 'uplink')]
    links += [link(chain[i], chain[i - 1], 'uplink') for i in range(1, len(chain))]
    # Many leaves under the same parent revisit already-walked ancestors.
    leaves = [node('workstation') for _ in range(50)]
    links += [link(leaf, chain[150], 'uplink') for leaf in leaves]
    check([root, *chain, *leaves], links)


# ── connections ──────────────────────────────────────────────────────────

def test_a_connection_must_end_on_the_map():
    a, stray = node(), node()
    with pytest.raises(GraphError, match='not on the map'):
        check([a], [link(a, stray)])


def test_a_device_cannot_connect_to_itself():
    a = node()
    with pytest.raises(GraphError, match='itself'):
        check([a], [link(a, a)])


@pytest.mark.parametrize('field,value', [('role', 'sideways'), ('kind', 'carrier-pigeon')])
def test_unknown_connection_vocab_is_refused(field, value):
    a, b = node(), node()
    bad = link(a, b).model_copy(update={field: value})
    with pytest.raises(GraphError, match='Unknown connection'):
        check([a, b], [bad])


def test_repeated_ids_are_refused():
    a, b = node(), node()
    one = link(a, b)
    with pytest.raises(GraphError, match='appears twice'):
        check([a, b], [one, one])
    with pytest.raises(GraphError, match='appears twice'):
        check([a, a])


# ── records ──────────────────────────────────────────────────────────────

def test_a_device_may_only_stand_for_a_record_of_this_organisation():
    with pytest.raises(GraphError, match='not in this organisation'):
        check([node(record=uuid.uuid4())])


def test_a_record_is_placed_once():
    with pytest.raises(GraphError, match='placed once'):
        check([node(record=RECORD_A), node(record=RECORD_A)])


def test_unknown_kinds_and_tones_are_refused():
    with pytest.raises(GraphError, match='device kind'):
        check([node('toaster')])
    with pytest.raises(GraphError, match='zone tone'):
        check(zones=[zone('chartreuse')])


# ── payload shape ────────────────────────────────────────────────────────

def test_functions_are_trimmed_and_deduplicated():
    n = MapNode(id=uuid.uuid4(), x=0, y=0, functions=[' DHCP ', 'DHCP', '', 'DNS'])
    assert n.functions == ['DHCP', 'DNS']


def test_non_finite_coordinates_are_refused():
    with pytest.raises(ValidationError):
        GraphSave.model_validate({'version': 1, 'nodes': [{'id': str(uuid.uuid4()), 'x': float('nan'), 'y': 0}]})

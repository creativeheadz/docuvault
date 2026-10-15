"""How a machine Wegweiser pushes finds its system, and what it may change.

Most machines a client's Wegweiser agents see are already here, imported
from MeshCentral. These pin the two things that keep a push from doubling
the estate or vandalising it: a device is matched on hardware identity
before anything is created, and a system MeshCentral syncs keeps
MeshCentral's values.
"""
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.system import System  # noqa: E402
from app.schemas.inventory import PushedDevice  # noqa: E402
from app.services.wegweiser_push import (  # noqa: E402
    apply_device, best_match, hostname_key, mac_key, serial_key,
)

ORG = uuid.uuid4()
NOW = datetime(2026, 10, 15, 9, 0, tzinfo=timezone.utc)


def device(**kw):
    base = dict(external_id=str(uuid.uuid4()), organization_ids=[ORG], name='DESK-01')
    base.update(kw)
    return PushedDevice(**base)


def system(**kw):
    return System(organization_id=ORG, name=kw.pop('name', 'something'), slug='s', **kw)


# ── identity keys ────────────────────────────────────────────────────────

def test_a_mac_is_the_same_mac_whatever_its_separators():
    assert mac_key('aa:bb:cc:dd:ee:ff') == mac_key('AA-BB-CC-DD-EE-FF') == mac_key('AABBCCDDEEFF')


def test_things_that_are_not_a_mac_are_not_one():
    assert mac_key('00:00:00:00:00:00') is None
    assert mac_key('FF:FF:FF:FF:FF:FF') is None
    assert mac_key('not a mac') is None
    assert mac_key(None) is None


def test_firmware_placeholder_serials_identify_nothing():
    for placeholder in ('To Be Filled By O.E.M.', 'Default string', 'System Serial Number', '0', ''):
        assert serial_key(placeholder) is None
    assert serial_key(' 5CD123ABC ') == '5cd123abc'


def test_hostnames_compare_in_their_short_form():
    assert hostname_key('Workstation-04.clients.local') == hostname_key('workstation-04') == 'workstation-04'


# ── matching ─────────────────────────────────────────────────────────────

def test_mac_beats_serial_beats_hostname():
    by_host = system(name='DESK-01')
    by_serial = system(serial_number='SER1')
    by_mac = system(mac_address='aa:bb:cc:dd:ee:01')
    d = device(name='DESK-01', serial_number='ser1', mac_addresses=['AABBCCDDEE01'])
    assert best_match([by_host, by_serial, by_mac], d) is by_mac
    assert best_match([by_host, by_serial], d) is by_serial
    assert best_match([by_host], d) is by_host


def test_a_domain_joined_machine_finds_its_meshcentral_record():
    mesh = system(name='WORKSTATION-04', hostname='workstation-04', mesh_node_id='node//x')
    assert best_match([mesh], device(name='Reception PC', hostname='workstation-04.clients.local')) is mesh


def test_nothing_in_common_is_no_match():
    assert best_match([system(name='OTHER', hostname='other')], device(name='DESK-01')) is None


def test_a_placeholder_serial_never_matches_another_placeholder():
    oem = system(name='box-a', serial_number='To Be Filled By O.E.M.')
    assert best_match([oem], device(name='box-b', serial_number='Default string')) is None


def test_ip_address_alone_is_never_a_match():
    """MeshCentral rows carry the site's NAT address, shared by every machine."""
    nat = system(name='laptop-7', ip_address='81.2.3.4')
    assert best_match([nat], device(name='desk-9', ip_address='81.2.3.4')) is None


# ── what a push may change ───────────────────────────────────────────────

def test_a_meshcentral_system_keeps_its_values_and_gains_the_blanks():
    mesh = system(name='DESK-01', operating_system='Windows 11 Pro', mesh_node_id='node//x')
    apply_device(mesh, device(operating_system='Windows 11 Enterprise', manufacturer='Dell',
                              mac_addresses=['aabbccddee01'], online=True), NOW)
    assert mesh.operating_system == 'Windows 11 Pro'
    assert mesh.manufacturer == 'Dell'
    assert mesh.mac_address == 'AA:BB:CC:DD:EE:01'
    assert mesh.wegweiser_online is True
    assert mesh.wegweiser_synced_at == NOW


def test_a_system_nobody_syncs_takes_wegweisers_values():
    typed = system(name='DESK-01', operating_system='Windows 10')
    apply_device(typed, device(operating_system='Windows 11 Pro'), NOW)
    assert typed.operating_system == 'Windows 11 Pro'


def test_the_operators_words_are_never_touched():
    documented = system(name='Reception PC', category='Workstation', body='Behind the desk.')
    apply_device(documented, device(name='DESKTOP-8F3K2', category='Laptop'), NOW)
    assert (documented.name, documented.category, documented.body) == ('Reception PC', 'Workstation', 'Behind the desk.')


def test_an_empty_value_never_clears_a_known_one():
    typed = system(name='x', hostname='desk-01', model='OptiPlex 7010')
    apply_device(typed, device(hostname='', model=None), NOW)
    assert (typed.hostname, typed.model) == ('desk-01', 'OptiPlex 7010')


def test_a_placeholder_serial_is_not_written():
    typed = system(name='x')
    apply_device(typed, device(serial_number='System Serial Number'), NOW)
    assert typed.serial_number is None


def test_the_link_carries_what_wegweiser_last_said():
    s = system(name='x')
    apply_device(s, device(external_id='dev-1', health_score=87.5, agent_version='0.3.112',
                           url='https://app.wegweiser.tech/devices/dev-1', group='Kennett HQ'), NOW)
    assert s.wegweiser_device_id == 'dev-1'
    assert s.wegweiser_extra == {
        'health_score': 87.5, 'agent_version': '0.3.112', 'group': 'Kennett HQ',
        'url': 'https://app.wegweiser.tech/devices/dev-1',
    }


def test_a_system_the_push_creates_says_it_came_from_wegweiser():
    import inspect
    from app.services import wegweiser_push
    assert 'source="wegweiser"' in inspect.getsource(wegweiser_push.push)

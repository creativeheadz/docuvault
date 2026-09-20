"""Where an uploaded file is allowed to land.

`attachable_type` is a free-form form field that used to be interpolated
straight into a filesystem path, so these are regression tests for a real
escape rather than hypothetical hardening.
"""
import sys
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.v1.attachments import _safe_dir, _upload_root  # noqa: E402


ID = uuid.uuid4()


@pytest.mark.parametrize("bad_type", [
    "/etc/cron.d",          # absolute - os.path.join drops everything left of it
    "../../../../etc",      # relative walk
    "..",
    "a/../../b",
    "C:\\Windows",
    "configurations/../..",
    "with space",
    "UPPER",
    "dot.dot",
    "",
    "-leading-dash",
])
def test_a_type_that_could_escape_is_refused(bad_type):
    with pytest.raises(HTTPException) as exc:
        _safe_dir(bad_type, ID)
    assert exc.value.status_code == 422


@pytest.mark.parametrize("good_type", [
    "configurations", "organizations", "password", "flexible_assets", "a", "a1_b",
])
def test_an_ordinary_resource_name_is_accepted(good_type):
    path = _safe_dir(good_type, ID)
    assert path.startswith(_upload_root() + "/")
    assert path.endswith(f"/{good_type}/{ID}")


def test_the_id_is_a_uuid_so_it_cannot_carry_a_path():
    """The route parses attachable_id as a UUID before the path is built, so
    the only way to reach _safe_dir is with a value that has no separators."""
    path = _safe_dir("documents", ID)
    assert ".." not in path
    assert path.count(str(ID)) == 1

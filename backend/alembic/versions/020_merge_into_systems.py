"""One record per system: configurations and systems become `systems`

Three things could describe a machine: a configuration (inventory, synced
from MeshCentral), a system (chat-written documentation, no organisation)
and a flexible asset. This keeps one. The configuration rows carry the
foreign keys, so their table survives under the new name and every id is
kept: a network map node, firewall rule, baseline or access grant that
pointed at a configuration points at the same row as a system. The old
documentation rows are copied in, ids and chat history intact, as systems
with no organisation (a platform or a vendor belongs to nobody's network).

A configuration's free-text notes become the system's body, the one
long-form text a system has.

Every system also says where it came from (`source`): `meshcentral` for one
its sync created, `manual` for one a person typed or a chat wrote. The code
that creates a system stamps it from here on (`wegweiser`, `map`, `csv`...).

Revision ID: 020
Revises: 019
Create Date: 2026-10-15 00:00:00.000000
"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB


revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables whose `configuration_id` becomes `system_id`, with what their
# foreign key does when the system goes.
REFERRERS = {
    "firewall_rules": "SET NULL",
    "configuration_baselines": "CASCADE",
    "network_map_nodes": "SET NULL",
    "user_accesses": "CASCADE",
}

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", (name or "").lower()).strip("-") or "system"


def _rename_index(old: str, new: str) -> None:
    op.execute(f'ALTER INDEX IF EXISTS "{old}" RENAME TO "{new}"')


def _rename_constraint(table: str, old: str, new: str) -> None:
    op.execute(
        f"""DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{old}') THEN
                ALTER TABLE "{table}" RENAME CONSTRAINT "{old}" TO "{new}";
            END IF;
        END $$;"""
    )


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Give the inventory table everything a documentation record had.
    op.alter_column("configurations", "configuration_type", new_column_name="category")
    op.add_column("configurations", sa.Column("slug", sa.String(255), nullable=True))
    op.add_column("configurations", sa.Column("short_description", sa.String(500), nullable=True))
    op.add_column("configurations", sa.Column("body", sa.Text(), nullable=True))
    op.add_column("configurations", sa.Column("tags", ARRAY(sa.String()), nullable=False, server_default="{}"))
    op.add_column("configurations", sa.Column("snippets", JSONB(), nullable=False, server_default="{}"))
    op.add_column("configurations", sa.Column("palace_drawer_ids", ARRAY(sa.String()), nullable=False, server_default="{}"))
    op.add_column("configurations", sa.Column("status", sa.String(20), nullable=False, server_default="active"))
    op.add_column("configurations", sa.Column("color", sa.String(20), nullable=True))
    op.add_column("configurations", sa.Column("icon", sa.String(50), nullable=True))
    op.add_column("configurations", sa.Column("source", sa.String(30), nullable=False, server_default="manual"))
    op.execute("UPDATE configurations SET source = 'meshcentral' WHERE mesh_node_id IS NOT NULL")
    op.alter_column("configurations", "organization_id", nullable=True)
    op.execute("UPDATE configurations SET body = notes WHERE notes IS NOT NULL AND notes <> ''")
    op.drop_column("configurations", "notes")

    # 2. Bring the documentation records across, ids kept so their chat
    #    history follows. They are services and vendors, not machines on a
    #    Cyber Essentials scope.
    op.execute(
        """
        INSERT INTO configurations (
            id, created_at, updated_at, organization_id, name, category, slug,
            short_description, body, tags, snippets, palace_drawer_ids, status,
            color, icon, archived_at, ce_in_scope
        )
        SELECT id, created_at, updated_at, NULL, name, category, slug,
               short_description, body, tags, snippets, palace_drawer_ids, status,
               color, icon, archived_at, false
        FROM systems
        """
    )
    op.drop_constraint("system_chat_messages_system_id_fkey", "system_chat_messages", type_="foreignkey")
    op.drop_table("systems")

    # 3. The inventory table takes the name.
    op.rename_table("configurations", "systems")
    _rename_constraint("systems", "configurations_pkey", "systems_pkey")
    _rename_constraint("systems", "configurations_organization_id_fkey", "systems_organization_id_fkey")
    _rename_constraint("systems", "uq_configurations_mesh_node_id", "uq_systems_mesh_node_id")
    _rename_index("ix_configurations_ce_in_scope", "ix_systems_ce_in_scope")
    _rename_index("ix_configurations_mesh_node_id", "ix_systems_mesh_node_id")
    _rename_index("ix_configurations_organization_id", "ix_systems_organization_id")
    op.create_foreign_key(
        "system_chat_messages_system_id_fkey", "system_chat_messages", "systems",
        ["system_id"], ["id"], ondelete="CASCADE",
    )

    # 4. Every former configuration gets a slug, unique across all systems.
    taken = {row.slug for row in conn.execute(sa.text("SELECT slug FROM systems WHERE slug IS NOT NULL"))}
    rows = conn.execute(sa.text("SELECT id, name FROM systems WHERE slug IS NULL ORDER BY created_at")).fetchall()
    for row in rows:
        base = _slugify(row.name)
        slug, n = base, 2
        while slug in taken:
            slug, n = f"{base}-{n}", n + 1
        taken.add(slug)
        conn.execute(sa.text("UPDATE systems SET slug = :s WHERE id = :i"), {"s": slug, "i": row.id})
    op.alter_column("systems", "slug", nullable=False)
    op.create_index("ix_systems_slug", "systems", ["slug"], unique=True)
    op.create_index("ix_systems_name", "systems", ["name"])
    op.create_index("ix_systems_category", "systems", ["category"])
    op.create_index("ix_systems_status", "systems", ["status"])
    op.create_index("ix_systems_source", "systems", ["source"])

    # 5. Whatever pointed at a configuration points at the same row, by its new name.
    for table in REFERRERS:
        op.alter_column(table, "configuration_id", new_column_name="system_id")
        _rename_index(f"ix_{table}_configuration_id", f"ix_{table}_system_id")
        _rename_constraint(table, f"{table}_configuration_id_fkey", f"{table}_system_id_fkey")
    op.rename_table("configuration_baselines", "system_baselines")
    _rename_constraint("system_baselines", "configuration_baselines_pkey", "system_baselines_pkey")
    _rename_constraint("system_baselines", "configuration_baselines_checklist_id_fkey", "system_baselines_checklist_id_fkey")
    _rename_constraint("system_baselines", "configuration_baselines_system_id_fkey", "system_baselines_system_id_fkey")
    _rename_constraint("system_baselines", "uq_configuration_baselines_config_checklist", "uq_system_baselines_system_checklist")
    for suffix in ("checklist_id", "system_id", "next_review_date"):
        _rename_index(f"ix_configuration_baselines_{suffix}", f"ix_system_baselines_{suffix}")


def downgrade() -> None:
    # Splitting one table back into two cannot be done faithfully: a record
    # edited since the merge has no single right home. Restore the database
    # dump taken before upgrading instead.
    raise NotImplementedError(
        "020 merged configurations and systems; restore the pre-020 database dump to go back"
    )

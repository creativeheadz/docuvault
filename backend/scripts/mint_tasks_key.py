"""Mint a `write:tasks` API key narrowed to one organisation, creating the
organisation if it does not exist. For putting a project's roadmap into the
tasks list so a coding assistant can keep it from a shell.

Run inside the backend container, on the VM, with the key going straight
into the client's config file and never onto a screen:

    cd ~/docuvault
    docker compose exec -T backend python - --org "Wegweiser" \\
        --name "claude-code (Wegweiser roadmap)" < backend/scripts/mint_tasks_key.py \\
      | dvtasks config --profile wegweiser --mint-stdin      # on the client machine

The JSON on stdout is the only copy of the key. Refuses to mint a second
live key with the same name; revoke the old one at Settings -> API keys
first, which is also where this key shows up and can be revoked later.
"""
import argparse
import json
import os
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models.api_token import ApiToken, SCOPE_WRITE_TASKS, generate_token
from app.models.organization import Organization


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--org", required=True, help="organisation name; created if missing")
    ap.add_argument("--name", required=True, help="key name as it will show in Settings -> API keys")
    ap.add_argument("--description", default="Tasks only, narrowed to one organisation; "
                    "used by a coding assistant through tools/dvtasks.py.")
    ap.add_argument("--url", default=os.environ.get("PUBLIC_URL", "https://crm.oldforge.tech"),
                    help="the instance URL to record for the client")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL_SYNC")
    if not url:
        print("DATABASE_URL_SYNC not set in the container", file=sys.stderr)
        return 1

    with Session(create_engine(url)) as s:
        org = s.execute(select(Organization).where(
            Organization.name == args.org, Organization.archived_at.is_(None))).scalar_one_or_none()
        if org is None:
            org = Organization(name=args.org,
                               description=f"{args.org}: its roadmap lives in Tasks, filtered to this organisation.")
            s.add(org)
            s.flush()
        live = s.execute(select(ApiToken).where(
            ApiToken.name == args.name, ApiToken.revoked_at.is_(None))).scalar_one_or_none()
        if live is not None:
            print(json.dumps({"error": "a live key with this name already exists; revoke it first",
                              "prefix": live.prefix, "organization_id": str(org.id)}), file=sys.stderr)
            return 2
        raw, prefix, digest = generate_token()
        s.add(ApiToken(name=args.name, description=args.description, prefix=prefix,
                       token_hash=digest, scopes=[SCOPE_WRITE_TASKS],
                       organization_ids=[org.id], created_by=None))
        s.commit()
        print(json.dumps({"token": raw, "prefix": prefix, "organization_id": str(org.id),
                          "organization": args.org, "url": args.url}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

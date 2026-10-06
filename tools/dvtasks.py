#!/usr/bin/env python3
"""dvtasks - read and change DocuVault tasks from a shell, with an API key.

Built for a coding assistant that keeps a product roadmap in DocuVault's
tasks list: no browser, no user session, no daily call cap. It talks to the
ordinary tasks API with a key that carries the `write:tasks` scope and is
(normally) narrowed to one organisation, so it can see and touch that
organisation's tasks and nothing else in the vault.

Standard library only, so it runs anywhere Python 3.10+ does.

Configuration, in order of precedence: flags, then environment
(DOCUVAULT_URL, DOCUVAULT_TOKEN, DOCUVAULT_ORG, DOCUVAULT_PROFILE), then the
repo's `.dvtasks.json` (organization_id and, optionally, profile - found by
walking up from the current directory, so it can be committed at a repo
root), then ~/.config/docuvault/<profile>.json or config.json with url,
token and organization_id. `dvtasks config` writes that file with mode 0600;
`dvtasks init` writes `.dvtasks.json`. One key per project is the intended
shape: a profile is a key narrowed to that project's organisation.

Task ids may be given as a full UUID or any unique prefix of one.
"""
from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "docuvault"
PROJECT_FILE = ".dvtasks.json"
STATUSES = ("idea", "todo", "in_progress", "blocked", "done", "archived")
PRIORITIES = ("low", "med", "high")
HIDDEN_BY_DEFAULT = {"done", "archived"}


# ── configuration ────────────────────────────────────────────────────────

def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        sys.exit(f"{path} is not valid JSON: {e}")


def project_settings() -> tuple[dict, Path | None]:
    """The nearest `.dvtasks.json` at or above the current directory."""
    here = Path.cwd()
    for d in (here, *here.parents):
        f = d / PROJECT_FILE
        if f.exists():
            return _read_json(f), f
    return {}, None


def config_path(profile: str | None) -> Path:
    return CONFIG_DIR / (f"{profile}.json" if profile else "config.json")


def load_config(args) -> dict:
    proj, _ = project_settings()
    profile = getattr(args, "profile", None) or os.environ.get("DOCUVAULT_PROFILE") or proj.get("profile")
    path = config_path(profile)
    cfg = _read_json(path) if path.exists() else {}
    url = args.url or os.environ.get("DOCUVAULT_URL") or cfg.get("url")
    token = args.token or os.environ.get("DOCUVAULT_TOKEN") or cfg.get("token")
    org = (args.org or os.environ.get("DOCUVAULT_ORG") or proj.get("organization_id")
           or cfg.get("organization_id"))
    if not url:
        sys.exit(f"no DocuVault URL: pass --url, set DOCUVAULT_URL, or run `dvtasks config --url ...` ({path})")
    if not token:
        sys.exit(f"no API key for profile {profile or 'default'}: pass --token, set DOCUVAULT_TOKEN, "
                 f"or run `dvtasks config --mint-stdin` / `--token-stdin` ({path})")
    return {"url": url.rstrip("/"), "token": token, "organization_id": org, "profile": profile}


def _write_private(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(stat.S_IRWXU)
    path.write_text(json.dumps(data, indent=2) + "\n")
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def cmd_config(args) -> None:
    path = config_path(args.profile)
    cfg = _read_json(path) if path.exists() else {}
    if args.url:
        cfg["url"] = args.url.rstrip("/")
    if args.mint_stdin:
        # The JSON that backend/scripts/mint_tasks_key.py prints exactly once.
        minted = json.loads(sys.stdin.read())
        cfg["token"] = minted["token"]
        cfg["organization_id"] = minted["organization_id"]
        cfg.setdefault("url", minted.get("url") or "https://crm.oldforge.tech")
    if args.token_stdin:
        cfg["token"] = sys.stdin.readline().strip()
    if args.org:
        cfg["organization_id"] = args.org
    _write_private(path, cfg)
    shown = {k: (v[:8] + "..." if k == "token" and v else v) for k, v in cfg.items()}
    print(f"wrote {path}: {json.dumps(shown)}")


def cmd_init(args) -> None:
    """Write `.dvtasks.json` in the current directory: which organisation this
    repo's tasks live under and which key profile to use. The organisation id
    is not a secret, so the file is meant to be committed."""
    profile = args.profile
    org = args.org
    if not org:
        path = config_path(profile)
        cfg = _read_json(path) if path.exists() else {}
        org = cfg.get("organization_id")
    if not org:
        sys.exit("no organisation id: pass --org, or `dvtasks config --mint-stdin` first")
    data = {"organization_id": org}
    if profile:
        data["profile"] = profile
    Path(PROJECT_FILE).write_text(json.dumps(data, indent=2) + "\n")
    print(f"wrote ./{PROJECT_FILE}: {json.dumps(data)}")


# ── HTTP ─────────────────────────────────────────────────────────────────

class Client:
    def __init__(self, cfg: dict):
        self.base = cfg["url"] + "/api/v1/tasks"
        self.token = cfg["token"]
        self.org = cfg["organization_id"]

    def call(self, method: str, path: str = "", params: dict | None = None, body: dict | None = None):
        url = self.base + path
        if params:
            clean = {k: v for k, v in params.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        data = json.dumps(body).encode() if body is not None else None
        # The public edge rate-limits /api; a bulk import trips it. Honour
        # Retry-After (or wait a little) rather than failing half-way.
        for attempt in range(6):
            req = urllib.request.Request(url, data=data, method=method, headers={
                "X-API-Key": self.token,
                "Accept": "application/json",
                **({"Content-Type": "application/json"} if data else {}),
            })
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    raw = r.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                if e.code in (429, 503) and attempt < 5:
                    wait = e.headers.get("Retry-After")
                    time.sleep(float(wait) if wait and wait.isdigit() else 2.0 * (attempt + 1))
                    continue
                detail = e.read().decode(errors="replace")[:400]
                try:
                    detail = json.loads(detail).get("detail", detail)
                except Exception:
                    pass
                sys.exit(f"{method} {url} -> {e.code}: {detail}")
            except urllib.error.URLError as e:
                sys.exit(f"{method} {url} -> {e.reason}")

    def all_tasks(self, include_archived: bool = True) -> list[dict]:
        return self.call("GET", params={
            "organization_id": self.org,
            "include_archived": "true" if include_archived else "false"})

    def resolve(self, ref: str) -> dict:
        """A task by full id or unique prefix."""
        ref = ref.strip().lower()
        if len(ref) < 4:
            sys.exit(f"'{ref}' is too short to identify a task; give at least 4 characters")
        hits = [t for t in self.all_tasks() if t["id"].lower().startswith(ref)]
        if not hits:
            sys.exit(f"no task matches '{ref}'")
        if len(hits) > 1:
            names = "; ".join(f"{t['id'][:8]} {t['title']}" for t in hits[:6])
            sys.exit(f"'{ref}' is ambiguous: {names}")
        return hits[0]


# ── printing ─────────────────────────────────────────────────────────────

def _line(t: dict, depth: int) -> str:
    pri = (t.get("priority") or "-").ljust(4)
    st = t["status"].ljust(11)
    due = f"  due {t['due_date'][:10]}" if t.get("due_date") else ""
    return f"{'  ' * depth}[{t['id'][:8]}] {pri} {st} {t['title']}{due}"


def print_tree(tasks: list[dict], show_all: bool, only_status: str | None) -> None:
    by_parent: dict[str | None, list[dict]] = {}
    for t in tasks:
        by_parent.setdefault(t.get("parent_id"), []).append(t)
    for kids in by_parent.values():
        kids.sort(key=lambda t: (t.get("position", 0), t.get("created_at") or ""))

    def visible(t: dict) -> bool:
        if only_status:
            return t["status"] == only_status
        return show_all or t["status"] not in HIDDEN_BY_DEFAULT

    def walk(parent_id, depth):
        for t in by_parent.get(parent_id, []):
            kids = by_parent.get(t["id"], [])
            # A parent prints when it is visible itself or has a visible descendant.
            if visible(t) or any(_has_visible(k) for k in kids):
                counts = _count(t["id"])
                suffix = f"   ({counts})" if kids else ""
                print(_line(t, depth) + suffix)
                walk(t["id"], depth + 1)

    def _has_visible(t):
        return visible(t) or any(_has_visible(k) for k in by_parent.get(t["id"], []))

    def _count(tid):
        kids = by_parent.get(tid, [])
        open_ = sum(1 for k in kids if k["status"] not in HIDDEN_BY_DEFAULT)
        return f"{open_} open, {len(kids) - open_} done" if kids else ""

    walk(None, 0)


def print_task(t: dict) -> None:
    print(f"id:        {t['id']}")
    print(f"title:     {t['title']}")
    print(f"status:    {t['status']}")
    print(f"priority:  {t.get('priority') or '-'}")
    print(f"parent:    {t.get('parent_id') or '-'}")
    print(f"org:       {t.get('organization_id') or '-'}")
    print(f"due:       {(t.get('due_date') or '-')[:10]}")
    print(f"children:  {t.get('child_count', 0)}")
    print(f"updated:   {(t.get('updated_at') or '-')[:19]}")
    if t.get("description"):
        print("\n" + t["description"].rstrip() + "\n")


# ── commands ─────────────────────────────────────────────────────────────

def _desc(args) -> str | None:
    if getattr(args, "desc_file", None):
        return Path(args.desc_file).read_text()
    return getattr(args, "desc", None)


def cmd_ls(args, c: Client) -> None:
    tasks = c.all_tasks(include_archived=args.all)
    if args.parent:
        root = c.resolve(args.parent)
        ids = {root["id"]}
        changed = True
        while changed:
            changed = False
            for t in tasks:
                if t.get("parent_id") in ids and t["id"] not in ids:
                    ids.add(t["id"]); changed = True
        tasks = [t for t in tasks if t["id"] in ids]
        tasks = [dict(t, parent_id=None) if t["id"] == root["id"] else t for t in tasks]
    if not tasks:
        print("no tasks visible to this key" + (f" in organisation {c.org}" if c.org else ""))
        return
    print_tree(tasks, show_all=args.all, only_status=args.status)


def cmd_show(args, c: Client) -> None:
    print_task(c.call("GET", f"/{c.resolve(args.id)['id']}"))


def cmd_add(args, c: Client) -> None:
    body = {
        "title": args.title,
        "description": _desc(args),
        "organization_id": c.org,
        "status": args.status,
        "priority": args.priority,
        "due_date": f"{args.due}T00:00:00Z" if args.due else None,
    }
    if args.parent:
        body["parent_id"] = c.resolve(args.parent)["id"]
    t = c.call("POST", body=body)
    print(_line(t, 0))


def cmd_set(args, c: Client) -> None:
    t = c.resolve(args.id)
    body = {}
    if args.title is not None:
        body["title"] = args.title
    if args.status is not None:
        body["status"] = args.status
    if args.priority is not None:
        body["priority"] = None if args.priority == "none" else args.priority
    if args.due is not None:
        body["due_date"] = None if args.due == "none" else f"{args.due}T00:00:00Z"
    if args.parent is not None:
        body["parent_id"] = None if args.parent == "none" else c.resolve(args.parent)["id"]
    if args.position is not None:
        body["position"] = args.position
    d = _desc(args)
    if d is not None:
        body["description"] = d
    if not body:
        sys.exit("nothing to change")
    print(_line(c.call("PUT", f"/{t['id']}", body=body), 0))


def cmd_done(args, c: Client) -> None:
    for ref in args.ids:
        t = c.resolve(ref)
        print(_line(c.call("PUT", f"/{t['id']}", body={"status": "done"}), 0))


def cmd_rm(args, c: Client) -> None:
    t = c.resolve(args.id)
    c.call("DELETE", f"/{t['id']}")
    print(f"deleted [{t['id'][:8]}] {t['title']}")


def cmd_import(args, c: Client) -> None:
    """Create a tree of tasks from JSON, skipping any title already present
    under the same parent, so a re-run adds what is missing and nothing
    twice. Shape: [{"title", "description", "status", "priority", "children": [...]}]."""
    spec = json.loads(Path(args.file).read_text())
    existing = c.all_tasks()
    index = {(t.get("parent_id"), t["title"]): t for t in existing}
    created = skipped = 0

    def ensure(node: dict, parent_id: str | None) -> dict:
        nonlocal created, skipped
        key = (parent_id, node["title"])
        if key in index:
            skipped += 1
            return index[key]
        t = c.call("POST", body={
            "title": node["title"],
            "description": node.get("description"),
            "organization_id": c.org,
            "parent_id": parent_id,
            "status": node.get("status", "todo"),
            "priority": node.get("priority"),
            "due_date": node.get("due_date"),
        })
        index[key] = t
        created += 1
        time.sleep(0.25)   # stay under the edge's request rate
        print(_line(t, 0 if parent_id is None else 1))
        return t

    def walk(nodes: list[dict], parent_id: str | None):
        for node in nodes:
            t = ensure(node, parent_id)
            if node.get("children"):
                walk(node["children"], t["id"])

    walk(spec, None)
    print(f"created {created}, already present {skipped}")


# ── entry point ──────────────────────────────────────────────────────────

def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="dvtasks", description=__doc__.split("\n\n")[0])
    ap.add_argument("--url", help="DocuVault base URL (default: env DOCUVAULT_URL, then config)")
    ap.add_argument("--token", help="API key with write:tasks (default: env DOCUVAULT_TOKEN, then config)")
    ap.add_argument("--org", help="organisation id to list under and create in (default: env DOCUVAULT_ORG, .dvtasks.json, config)")
    ap.add_argument("--profile", help="which ~/.config/docuvault/<profile>.json to use (default: env DOCUVAULT_PROFILE, .dvtasks.json, config.json)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("config", help="write ~/.config/docuvault/<profile>.json (or config.json)")
    p.add_argument("--url"); p.add_argument("--org")
    p.add_argument("--token-stdin", action="store_true", help="read the key from the first line of stdin")
    p.add_argument("--mint-stdin", action="store_true", help="read the JSON printed by backend/scripts/mint_tasks_key.py from stdin")
    p.set_defaults(fn=cmd_config, needs_client=False)

    p = sub.add_parser("init", help="write ./.dvtasks.json for this repo (organisation id + profile)")
    p.add_argument("--org"); p.set_defaults(fn=cmd_init, needs_client=False)

    p = sub.add_parser("ls", help="tree of tasks (done and archived hidden unless --all)")
    p.add_argument("--all", action="store_true"); p.add_argument("--status", choices=STATUSES)
    p.add_argument("--parent", help="only this task and what is under it")
    p.set_defaults(fn=cmd_ls)

    p = sub.add_parser("show", help="one task with its description"); p.add_argument("id")
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser("add", help="create a task"); p.add_argument("title")
    p.add_argument("--parent"); p.add_argument("--status", choices=STATUSES, default="todo")
    p.add_argument("--priority", choices=PRIORITIES); p.add_argument("--due", help="YYYY-MM-DD")
    p.add_argument("--desc"); p.add_argument("--desc-file")
    p.set_defaults(fn=cmd_add)

    p = sub.add_parser("set", help="change fields on a task"); p.add_argument("id")
    p.add_argument("--title"); p.add_argument("--status", choices=STATUSES)
    p.add_argument("--priority", choices=PRIORITIES + ("none",)); p.add_argument("--due", help="YYYY-MM-DD or none")
    p.add_argument("--parent", help="task id or none"); p.add_argument("--position", type=int)
    p.add_argument("--desc"); p.add_argument("--desc-file")
    p.set_defaults(fn=cmd_set)

    p = sub.add_parser("done", help="mark tasks done"); p.add_argument("ids", nargs="+")
    p.set_defaults(fn=cmd_done)

    p = sub.add_parser("rm", help="delete a task and everything under it"); p.add_argument("id")
    p.set_defaults(fn=cmd_rm)

    p = sub.add_parser("import", help="create a tree of tasks from a JSON file, idempotently")
    p.add_argument("file"); p.set_defaults(fn=cmd_import)

    args = ap.parse_args(argv)
    if getattr(args, "needs_client", True):
        args.fn(args, Client(load_config(args)))
    else:
        args.fn(args)


if __name__ == "__main__":
    main()

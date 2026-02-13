"""
Comprehensive endpoint test script - simulates user activity across every portal page.
Tests CREATE, READ, UPDATE, DELETE for all entity types.
"""
import requests
import json
import sys

BASE = "http://localhost:8000/api/v1"
SESSION = requests.Session()
RESULTS = []
CREATED_IDS = {}


def log(method, path, status, ok, detail=""):
    icon = "PASS" if ok else "FAIL"
    RESULTS.append({"method": method, "path": path, "status": status, "ok": ok, "detail": detail})
    d = f" - {detail}" if detail else ""
    print(f"  [{icon}] {method:6s} {path} -> {status}{d}")


def api(method, path, json_data=None, params=None, expect_status=None):
    url = f"{BASE}{path}"
    try:
        resp = SESSION.request(method, url, json=json_data, params=params, timeout=10)
    except Exception as e:
        log(method, path, 0, False, str(e))
        return None

    if expect_status:
        ok = resp.status_code == expect_status
    else:
        ok = resp.status_code < 400

    detail = ""
    if not ok:
        try:
            detail = resp.text[:300]
        except:
            detail = f"status={resp.status_code}"

    log(method, path, resp.status_code, ok, detail)

    if ok and resp.status_code != 204:
        try:
            return resp.json()
        except:
            return None
    return None


def test_auth():
    print("\n=== AUTH ===")
    data = api("POST", "/auth/login", {"username": "andrei.trimbitas", "password": "9Palo)pad"})
    if data and "access_token" in data:
        SESSION.headers["Authorization"] = f"Bearer {data['access_token']}"
        print(f"  Token acquired.")
    else:
        print("  FATAL: Cannot login. Aborting.")
        sys.exit(1)

    api("GET", "/auth/me")


def test_organizations():
    print("\n=== ORGANIZATIONS (list, create, get, update, delete) ===")
    api("GET", "/organizations", params={"page": 1, "page_size": 10})

    org = api("POST", "/organizations", {
        "name": "Test Org Inc",
        "description": "Integration test org",
        "website": "https://testorg.example.com",
        "phone": "555-0100",
        "address": "123 Test St"
    })
    if org:
        CREATED_IDS["org"] = org["id"]
        api("GET", f"/organizations/{org['id']}")
        api("PUT", f"/organizations/{org['id']}", {
            "name": "Test Org Inc Updated",
            "description": "Updated description"
        })
    else:
        print("  WARN: Org creation failed, downstream tests may fail")


def test_locations():
    print("\n=== LOCATIONS (list, create, get, update, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/locations", params={"organization_id": org_id})

    loc = api("POST", "/locations", {
        "organization_id": org_id,
        "name": "Main Office",
        "address_line1": "456 Business Ave",
        "city": "Portland",
        "state": "OR",
        "zip_code": "97201",
        "country": "US",
        "phone": "555-0101",
        "is_primary": True,
        "notes": "Test location"
    })
    if loc:
        CREATED_IDS["location"] = loc["id"]
        api("GET", f"/locations/{loc['id']}")
        api("PUT", f"/locations/{loc['id']}", {"name": "Main Office Updated", "city": "Seattle"})


def test_contacts():
    print("\n=== CONTACTS (list, create, get, update, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/contacts", params={"organization_id": org_id})

    contact = api("POST", "/contacts", {
        "organization_id": org_id,
        "first_name": "Jane",
        "last_name": "Doe",
        "title": "CTO",
        "email": "jane.doe@testorg.com",
        "phone": "555-0102",
        "mobile": "555-0103",
        "is_primary": True,
        "notes": "Primary contact"
    })
    if contact:
        CREATED_IDS["contact"] = contact["id"]
        api("GET", f"/contacts/{contact['id']}")
        api("PUT", f"/contacts/{contact['id']}", {"title": "CEO", "notes": "Promoted"})


def test_configurations():
    print("\n=== CONFIGURATIONS (list, create, get, update, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/configurations", params={"organization_id": org_id})

    config = api("POST", "/configurations", {
        "organization_id": org_id,
        "name": "Web Server 01",
        "configuration_type": "Server",
        "hostname": "web01.testorg.com",
        "ip_address": "192.168.1.10",
        "mac_address": "AA:BB:CC:DD:EE:FF",
        "serial_number": "SN-12345",
        "operating_system": "Ubuntu",
        "os_version": "22.04 LTS",
        "manufacturer": "Dell",
        "model": "PowerEdge R640",
        "warranty_expiration": "2027-06-15",
        "notes": "Production web server"
    })
    if config:
        CREATED_IDS["config"] = config["id"]
        api("GET", f"/configurations/{config['id']}")
        api("PUT", f"/configurations/{config['id']}", {"name": "Web Server 01 Updated", "os_version": "24.04 LTS"})


def test_passwords():
    print("\n=== PASSWORDS (categories, list, create, get, update, reveal, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    # Categories
    api("GET", "/passwords/categories", params={"organization_id": org_id})

    cat = api("POST", "/passwords/categories", {
        "organization_id": org_id,
        "name": "Server Credentials"
    })
    cat_id = cat["id"] if cat else None
    if cat_id:
        CREATED_IDS["password_cat"] = cat_id

    # Passwords
    api("GET", "/passwords", params={"organization_id": org_id})

    pw = api("POST", "/passwords", {
        "organization_id": org_id,
        "name": "Root SSH Key",
        "username": "root",
        "password_value": "SuperSecret123!",
        "url": "ssh://web01.testorg.com",
        "notes": "Root access",
        "category_id": cat_id
    })
    if pw:
        CREATED_IDS["password"] = pw["id"]
        api("GET", f"/passwords/{pw['id']}")
        api("PUT", f"/passwords/{pw['id']}", {"name": "Root SSH Key Updated", "username": "admin"})
        api("POST", f"/passwords/{pw['id']}/reveal")
        api("GET", f"/passwords/{pw['id']}/audit")


def test_domains():
    print("\n=== DOMAINS (list, create, get, update, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/domains", params={"organization_id": org_id})

    domain = api("POST", "/domains", {
        "organization_id": org_id,
        "domain_name": "testorg.com",
        "registrar": "Namecheap",
        "registration_date": "2020-01-15",
        "expiration_date": "2027-01-15",
        "auto_renew": True,
        "dns_records": {"A": "203.0.113.10", "MX": "mail.testorg.com"},
        "notes": "Primary domain"
    })
    if domain:
        CREATED_IDS["domain"] = domain["id"]
        api("GET", f"/domains/{domain['id']}")
        api("PUT", f"/domains/{domain['id']}", {"registrar": "Cloudflare", "notes": "Transferred"})


def test_ssl_certificates():
    print("\n=== SSL CERTIFICATES (list, create, get, update, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/ssl-certificates", params={"organization_id": org_id})

    cert = api("POST", "/ssl-certificates", {
        "organization_id": org_id,
        "common_name": "*.testorg.com",
        "issuer": "Let's Encrypt",
        "issued_date": "2026-01-01",
        "expiration_date": "2026-04-01",
        "sans": ["testorg.com", "www.testorg.com", "api.testorg.com"],
        "key_algorithm": "RSA-2048",
        "notes": "Wildcard cert"
    })
    if cert:
        CREATED_IDS["ssl_cert"] = cert["id"]
        api("GET", f"/ssl-certificates/{cert['id']}")
        api("PUT", f"/ssl-certificates/{cert['id']}", {"issuer": "DigiCert", "notes": "Upgraded CA"})


def test_documents():
    print("\n=== DOCUMENTS (folders, templates, list, create, get, update, versions, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    # Folders
    api("GET", "/documents/folders", params={"organization_id": org_id})

    folder = api("POST", "/documents/folders", {
        "organization_id": org_id,
        "name": "Runbooks"
    })
    folder_id = folder["id"] if folder else None
    if folder_id:
        CREATED_IDS["doc_folder"] = folder_id

    # Templates
    api("GET", "/documents/templates")

    tmpl = api("POST", "/documents/templates", {
        "name": "SOP Template",
        "category": "operations",
        "content": {"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "SOP Template"}]}]}
    })
    if tmpl:
        CREATED_IDS["doc_template"] = tmpl["id"]

    # Documents
    api("GET", "/documents", params={"organization_id": org_id})

    doc = api("POST", "/documents", {
        "organization_id": org_id,
        "folder_id": folder_id,
        "title": "Server Setup Guide",
        "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Step 1: Install OS. Step 2: Configure networking."}]}]}
    })
    if doc:
        CREATED_IDS["document"] = doc["id"]
        api("GET", f"/documents/{doc['id']}")
        api("PUT", f"/documents/{doc['id']}", {
            "title": "Server Setup Guide v2",
            "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Updated server setup instructions v2."}]}]},
            "change_summary": "Updated to v2"
        })
        api("GET", f"/documents/{doc['id']}/versions")


def test_flexible_assets():
    print("\n=== FLEXIBLE ASSET TYPES & ASSETS (list, create, get, update, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/flexible-asset-types")

    fat = api("POST", "/flexible-asset-types", {
        "name": "Network Device",
        "description": "Track network devices",
        "icon": "router",
        "color": "#3B82F6",
        "is_enabled": True,
        "fields": [
            {"name": "Device Name", "field_type": "text", "hint": "Name of device", "required": True, "sort_order": 1},
            {"name": "IP Address", "field_type": "text", "hint": "Management IP", "required": False, "sort_order": 2}
        ]
    })
    if fat:
        CREATED_IDS["flex_type"] = fat["id"]
        api("GET", f"/flexible-asset-types/{fat['id']}")
        api("PUT", f"/flexible-asset-types/{fat['id']}", {"name": "Network Device Updated", "color": "#10B981"})

        # Create an asset of this type
        api("GET", "/flexible-assets", params={"asset_type_id": fat["id"]})

        fa = api("POST", "/flexible-assets", {
            "asset_type_id": fat["id"],
            "organization_id": org_id,
            "name": "Core Switch 01",
            "data": {"Device Name": "core-sw-01", "IP Address": "10.0.0.1"}
        })
        if fa:
            CREATED_IDS["flex_asset"] = fa["id"]
            api("GET", f"/flexible-assets/{fa['id']}")
            api("PUT", f"/flexible-assets/{fa['id']}", {"name": "Core Switch 01 Updated"})


def test_checklists():
    print("\n=== CHECKLISTS (list, create, get, update, items, toggle, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/checklists", params={"organization_id": org_id})

    cl = api("POST", "/checklists", {
        "organization_id": org_id,
        "name": "New Client Onboarding",
        "description": "Steps for onboarding a new client"
    })
    if cl:
        CREATED_IDS["checklist"] = cl["id"]
        api("GET", f"/checklists/{cl['id']}")
        api("PUT", f"/checklists/{cl['id']}", {"name": "Client Onboarding Checklist"})

        # Items
        item = api("POST", f"/checklists/{cl['id']}/items", {
            "content": "Collect client requirements",
            "is_checked": False,
            "sort_order": 1
        })
        if item:
            CREATED_IDS["checklist_item"] = item["id"]
            api("POST", f"/checklists/{cl['id']}/items/{item['id']}/toggle")
            api("PUT", f"/checklists/{cl['id']}/items/{item['id']}", {"content": "Collect client requirements (updated)"})

        item2 = api("POST", f"/checklists/{cl['id']}/items", {
            "content": "Create documentation",
            "is_checked": False,
            "sort_order": 2
        })
        if item2:
            CREATED_IDS["checklist_item2"] = item2["id"]


def test_runbooks():
    print("\n=== RUNBOOKS (list, create, get, update, steps, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/runbooks", params={"organization_id": org_id})

    rb = api("POST", "/runbooks", {
        "organization_id": org_id,
        "name": "Incident Response Plan",
        "description": "Steps to handle production incidents"
    })
    if rb:
        CREATED_IDS["runbook"] = rb["id"]
        api("GET", f"/runbooks/{rb['id']}")
        api("PUT", f"/runbooks/{rb['id']}", {"name": "Incident Response Plan v2"})

        # Steps
        step = api("POST", f"/runbooks/{rb['id']}/steps", {
            "step_number": 1,
            "title": "Assess the situation",
            "content": {"text": "Check monitoring dashboards and alert channels"},
            "is_completed": False
        })
        if step:
            CREATED_IDS["runbook_step"] = step["id"]
            api("PUT", f"/runbooks/{rb['id']}/steps/{step['id']}", {"is_completed": True})

        step2 = api("POST", f"/runbooks/{rb['id']}/steps", {
            "step_number": 2,
            "title": "Notify stakeholders",
            "content": {"text": "Send initial comms to Slack #incidents"},
            "is_completed": False
        })
        if step2:
            CREATED_IDS["runbook_step2"] = step2["id"]


def test_search():
    print("\n=== SEARCH ===")
    api("GET", "/search", params={"q": "Test", "page": 1, "page_size": 10})
    api("GET", "/search", params={"q": "Server", "page": 1, "page_size": 10})
    api("GET", "/search", params={"q": "testorg.com", "page": 1, "page_size": 10})


def test_reports():
    print("\n=== REPORTS ===")
    api("GET", "/reports/coverage")
    api("GET", "/reports/activity", params={"limit": 20})


def test_flags():
    print("\n=== FLAGS (list, create, get, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/flags")

    flag = api("POST", "/flags", {
        "entity_type": "organization",
        "entity_id": org_id,
        "flag_type": "warning",
        "message": "Documentation coverage below threshold"
    })
    if flag:
        CREATED_IDS["flag"] = flag["id"]
        api("GET", f"/flags/{flag['id']}")


def test_relationships():
    print("\n=== RELATIONSHIPS (list, create, delete) ===")
    org_id = CREATED_IDS.get("org")
    config_id = CREATED_IDS.get("config")
    if not org_id or not config_id:
        print("  SKIP: need org + config")
        return

    api("GET", "/relationships", params={"source_type": "organization", "source_id": org_id})

    rel = api("POST", "/relationships", {
        "source_type": "organization",
        "source_id": org_id,
        "target_type": "configuration",
        "target_id": config_id,
        "relationship_type": "has_configuration"
    })
    if rel:
        CREATED_IDS["relationship"] = rel["id"]


def test_attachments():
    print("\n=== ATTACHMENTS (list, upload, download, delete) ===")
    org_id = CREATED_IDS.get("org")
    if not org_id:
        print("  SKIP: no org_id")
        return

    api("GET", "/attachments", params={"attachable_type": "organization", "attachable_id": org_id})

    # Upload a test file
    url = f"{BASE}/attachments"
    try:
        import io
        file_content = b"This is a test attachment file for integration testing."
        files = {"file": ("test_doc.txt", io.BytesIO(file_content), "text/plain")}
        data = {"attachable_type": "organization", "attachable_id": org_id}
        resp = SESSION.post(url, files=files, data=data, timeout=10)
        ok = resp.status_code < 400
        detail = "" if ok else resp.text[:300]
        log("POST", "/attachments (upload)", resp.status_code, ok, detail)
        if ok:
            att = resp.json()
            CREATED_IDS["attachment"] = att["id"]
            # Download
            dl_resp = SESSION.get(f"{BASE}/attachments/{att['id']}/download", timeout=10)
            log("GET", f"/attachments/{att['id']}/download", dl_resp.status_code, dl_resp.status_code < 400)
    except Exception as e:
        log("POST", "/attachments (upload)", 0, False, str(e))


def test_webhooks():
    print("\n=== WEBHOOKS (list, create, get, update, delete) ===")
    api("GET", "/webhooks")

    wh = api("POST", "/webhooks", {
        "name": "Slack Notifier",
        "url": "https://hooks.slack.example.com/test",
        "events": ["organization.created", "password.created"],
        "is_active": True,
        "secret": "webhook-secret-123"
    })
    if wh:
        CREATED_IDS["webhook"] = wh["id"]
        api("GET", f"/webhooks/{wh['id']}")
        api("PUT", f"/webhooks/{wh['id']}", {"name": "Slack Notifier Updated", "is_active": False})


def test_settings():
    print("\n=== SETTINGS (app, sidebar, ip-whitelist) ===")
    # App settings
    api("GET", "/settings/app")
    app_setting = api("POST", "/settings/app", {"key": "test_setting", "value": {"enabled": True, "threshold": 80}})
    if app_setting:
        CREATED_IDS["app_setting"] = app_setting["id"]
        api("GET", f"/settings/app/{app_setting['id']}")
        api("PUT", f"/settings/app/{app_setting['id']}", {"value": {"enabled": False, "threshold": 90}})

    # Sidebar
    api("GET", "/settings/sidebar")
    sidebar = api("POST", "/settings/sidebar", {
        "item_key": "test_nav",
        "label": "Test Nav",
        "icon": "beaker",
        "sort_order": 99,
        "is_visible": True
    })
    if sidebar:
        CREATED_IDS["sidebar"] = sidebar["id"]
        api("GET", f"/settings/sidebar/{sidebar['id']}")
        api("PUT", f"/settings/sidebar/{sidebar['id']}", {"label": "Test Nav Updated", "is_visible": False})

    # IP Whitelist
    api("GET", "/settings/ip-whitelist")
    ip_wl = api("POST", "/settings/ip-whitelist", {"ip_address": "10.0.0.0/8", "is_active": True})
    if ip_wl:
        CREATED_IDS["ip_whitelist"] = ip_wl["id"]
        api("GET", f"/settings/ip-whitelist/{ip_wl['id']}")
        api("PUT", f"/settings/ip-whitelist/{ip_wl['id']}", {"is_active": False})


def test_audit_logs():
    print("\n=== AUDIT LOGS ===")
    api("GET", "/audit-logs", params={"page": 1, "page_size": 10})


def cleanup():
    """Delete all created test entities in reverse dependency order."""
    print("\n=== CLEANUP (deleting test data) ===")

    delete_order = [
        ("relationship", "/relationships"),
        ("flag", "/flags"),
        ("attachment", "/attachments"),
        ("runbook_step2", None),  # deleted with runbook
        ("runbook_step", None),
        ("runbook", "/runbooks"),
        ("checklist_item2", None),  # deleted with checklist
        ("checklist_item", None),
        ("checklist", "/checklists"),
        ("flex_asset", "/flexible-assets"),
        ("flex_type", "/flexible-asset-types"),
        ("document", "/documents"),
        ("doc_template", "/documents/templates"),
        ("doc_folder", "/documents/folders"),
        ("password", "/passwords"),
        ("password_cat", "/passwords/categories"),
        ("ssl_cert", "/ssl-certificates"),
        ("domain", "/domains"),
        ("config", "/configurations"),
        ("contact", "/contacts"),
        ("location", "/locations"),
        ("webhook", "/webhooks"),
        ("app_setting", "/settings/app"),
        ("sidebar", "/settings/sidebar"),
        ("ip_whitelist", "/settings/ip-whitelist"),
        ("org", "/organizations"),
    ]

    for key, path in delete_order:
        if path and key in CREATED_IDS:
            api("DELETE", f"{path}/{CREATED_IDS[key]}", expect_status=204)


def print_summary():
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)

    passed = sum(1 for r in RESULTS if r["ok"])
    failed = sum(1 for r in RESULTS if not r["ok"])
    total = len(RESULTS)

    print(f"\nTotal: {total}  |  Passed: {passed}  |  Failed: {failed}")

    if failed > 0:
        print(f"\n--- FAILURES ---")
        for r in RESULTS:
            if not r["ok"]:
                d = f"\n     {r['detail']}" if r["detail"] else ""
                print(f"  {r['method']:6s} {r['path']} -> {r['status']}{d}")

    print()
    return failed


if __name__ == "__main__":
    print("=" * 70)
    print("DOCUVAULT - FULL ENDPOINT INTEGRATION TEST")
    print("Simulating user activity across all portal pages")
    print("=" * 70)

    test_auth()
    test_organizations()
    test_locations()
    test_contacts()
    test_configurations()
    test_passwords()
    test_domains()
    test_ssl_certificates()
    test_documents()
    test_flexible_assets()
    test_checklists()
    test_runbooks()
    test_search()
    test_reports()
    test_flags()
    test_relationships()
    test_attachments()
    test_webhooks()
    test_settings()
    test_audit_logs()
    cleanup()

    failures = print_summary()
    sys.exit(1 if failures else 0)

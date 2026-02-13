from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.organizations import router as org_router
from app.api.v1.locations import router as loc_router
from app.api.v1.contacts import router as contact_router
from app.api.v1.configurations import router as config_router
from app.api.v1.passwords import router as password_router
from app.api.v1.domains import router as domain_router
from app.api.v1.ssl_certificates import router as ssl_router
from app.api.v1.flexible_asset_types import router as fat_router
from app.api.v1.flexible_assets import router as fa_router
from app.api.v1.documents import router as doc_router
from app.api.v1.attachments import router as att_router
from app.api.v1.relationships import router as rel_router
from app.api.v1.search import router as search_router
from app.api.v1.audit import router as audit_router
from app.api.v1.checklists import router as checklist_router
from app.api.v1.runbooks import router as runbook_router
from app.api.v1.reports import router as report_router
from app.api.v1.flags import router as flag_router
from app.api.v1.webhooks import router as webhook_router
from app.api.v1.settings import router as settings_router
from app.api.v1.mfa import router as mfa_router
from app.api.v1.meshcentral import router as mesh_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(org_router)
api_router.include_router(loc_router)
api_router.include_router(contact_router)
api_router.include_router(config_router)
api_router.include_router(password_router)
api_router.include_router(domain_router)
api_router.include_router(ssl_router)
api_router.include_router(fat_router)
api_router.include_router(fa_router)
api_router.include_router(doc_router)
api_router.include_router(att_router)
api_router.include_router(rel_router)
api_router.include_router(search_router)
api_router.include_router(audit_router)
api_router.include_router(checklist_router)
api_router.include_router(runbook_router)
api_router.include_router(report_router)
api_router.include_router(flag_router)
api_router.include_router(webhook_router)
api_router.include_router(settings_router)
api_router.include_router(mfa_router)
api_router.include_router(mesh_router)

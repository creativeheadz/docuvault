export interface User {
  id: string
  username: string
  email: string | null
  full_name: string | null
  is_active: boolean
  totp_enabled: boolean
}

export interface Organization {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  logo_url: string | null
  website: string | null
  phone: string | null
  address: string | null
  mesh_id: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface LoginResponse {
  mfa_required: boolean
  access_token: string | null
  refresh_token: string | null
  token_type: string
  mfa_token: string | null
}

export interface TotpSetupResponse {
  secret: string
  qr_code: string
  provisioning_uri: string
}

export interface TotpStatusResponse {
  totp_enabled: boolean
}

export interface Location {
  id: string
  organization_id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  phone: string | null
  fax: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  title: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  notes: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface Configuration {
  id: string
  organization_id: string
  name: string
  configuration_type: string | null
  hostname: string | null
  ip_address: string | null
  mac_address: string | null
  serial_number: string | null
  operating_system: string | null
  os_version: string | null
  manufacturer: string | null
  model: string | null
  warranty_expiration: string | null
  notes: string | null
  mesh_node_id: string | null
  mesh_agent_connected: boolean | null
  mesh_last_sync_at: string | null
  mesh_extra: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Password {
  id: string
  organization_id: string
  name: string
  url: string | null
  username: string | null
  notes: string | null
  category_id: string | null
  created_at: string
  updated_at: string
}

export interface PasswordCategory {
  id: string
  organization_id: string
  name: string
  parent_id: string | null
}

export interface Domain {
  id: string
  organization_id: string
  domain_name: string
  registrar: string | null
  registration_date: string | null
  expiration_date: string | null
  auto_renew: boolean
  dns_records: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SSLCertificate {
  id: string
  organization_id: string
  common_name: string
  issuer: string | null
  issued_date: string | null
  expiration_date: string | null
  sans: string[] | null
  key_algorithm: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FlexibleAssetType {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  is_enabled: boolean
  sections: FlexibleAssetSection[]
  created_at: string
  updated_at: string
}

export interface FlexibleAssetSection {
  id: string
  asset_type_id: string
  name: string
  sort_order: number
  fields: FlexibleAssetField[]
}

export interface FlexibleAssetField {
  id: string
  asset_type_id: string
  section_id: string | null
  name: string
  field_type: string
  hint: string | null
  required: boolean
  options: Record<string, unknown> | null
  sort_order: number
}

export interface FlexibleAsset {
  id: string
  asset_type_id: string
  organization_id: string
  name: string
  field_values: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  organization_id: string | null
  folder_id: string | null
  title: string
  content: unknown
  version: number
  created_at: string
  updated_at: string
}

export interface DocumentFolder {
  id: string
  organization_id: string | null
  parent_id: string | null
  name: string
  children?: DocumentFolder[]
}

export interface DocumentVersion {
  id: string
  document_id: string
  version: number
  content: unknown
  change_summary: string | null
  created_at: string
}

export interface DocumentTemplate {
  id: string
  name: string
  content: unknown
  category: string | null
}

export interface Checklist {
  id: string
  organization_id: string
  name: string
  description: string | null
  items: ChecklistItem[]
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  content: string
  is_checked: boolean
  parent_id: string | null
  sort_order: number
  children?: ChecklistItem[]
}

export interface Runbook {
  id: string
  organization_id: string
  name: string
  description: string | null
  steps: RunbookStep[]
  created_at: string
  updated_at: string
}

export interface RunbookStep {
  id: string
  runbook_id: string
  step_number: number
  title: string
  content: unknown
  is_completed: boolean
}

export interface Relationship {
  id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  relationship_type: string | null
  source_label?: string
  target_label?: string
}

export interface AuditLogEntry {
  id: string
  entity_type: string
  entity_id: string
  action: string
  changes: Record<string, unknown> | null
  user_id: string | null
  ip_address: string | null
  created_at: string
}

export interface Flag {
  id: string
  entity_type: string
  entity_id: string
  flag_type: string
  message: string | null
  created_at: string
}

export interface Webhook {
  id: string
  name: string
  url: string
  events: string[]
  is_active: boolean
  secret: string | null
  created_at: string
  updated_at: string
}

export interface SidebarItem {
  key: string
  label: string
  icon: string
  sort_order: number
  is_visible: boolean
}

export interface MeshCentralSettings {
  url: string | null
  username: string | null
  password_set: boolean
  configured: boolean
}

export interface MeshSyncResult {
  orgs_created: number
  orgs_updated: number
  devices_created: number
  devices_updated: number
  online: number
  offline: number
  errors: string[]
}

export interface MeshRemoteUrls {
  desktop: string | null
  terminal: string | null
  files: string | null
}

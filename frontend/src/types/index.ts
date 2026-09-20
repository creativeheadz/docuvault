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
  ce_in_scope: boolean
  device_role: DeviceRole | null
  software_firewall_on: boolean | null
  malware_protection: MalwareProtection | null
  os_eol_date: string | null
  last_patched_date: string | null
  created_at: string
  updated_at: string
}

export type DeviceRole = 'employee' | 'admin' | 'byod' | 'server' | 'network'
export type MalwareProtection = 'defender' | 'allowlist' | 'thirdparty' | 'none'

export interface FleetReadiness {
  in_scope: number
  no_firewall_data: number
  firewall_off: number
  no_malware_protection: number
  os_eol_now: number
  os_eol_soon: number
  patch_stale: number
}

export interface BaselineApplication {
  id: string
  configuration_id: string
  configuration_name: string
  checklist_id: string
  checklist_name: string
  last_verified_date: string | null
  review_period_months: number
  next_review_date: string
  notes: string | null
  days_until_review: number | null
  created_at: string
  updated_at: string
}

export interface BaselineStats {
  total_applications: number
  overdue: number
  baselines: number
}

export type AccessPrivilege = 'standard' | 'admin' | 'owner'
export type PersonCategory = 'employee' | 'contractor' | 'msp' | 'vendor' | 'customer'
export type AccessSystemType = 'cloud_service' | 'configuration' | 'custom'

export interface UserAccess {
  id: string
  contact_id: string
  contact_name: string
  contact_email: string | null
  cloud_service_id: string | null
  configuration_id: string | null
  custom_system_label: string | null
  system_type: AccessSystemType
  system_label: string
  system_key: string
  privilege_level: AccessPrivilege
  person_category: PersonCategory | null
  mfa_enabled: boolean
  is_active: boolean
  access_granted_date: string | null
  last_reviewed_date: string | null
  review_period_months: number
  next_review_date: string
  days_until_review: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface UserAccessStats {
  active_accesses: number
  admin_accesses: number
  no_mfa: number
  no_mfa_admins: number
  overdue_reviews: number
}

export interface AccessMatrixPerson { id: string; name: string; email: string | null }
export interface AccessMatrixSystem { key: string; type: AccessSystemType; name: string }
export interface AccessMatrixCell {
  access_id: string
  contact_id: string
  system_key: string
  privilege_level: AccessPrivilege
  mfa_enabled: boolean
  next_review_date: string
  days_until_review: number
}
export interface AccessMatrix {
  people: AccessMatrixPerson[]
  systems: AccessMatrixSystem[]
  cells: AccessMatrixCell[]
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
  last_probed_at: string | null
  whois_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface DomainProbeResult {
  domain: Domain
  nameservers: string[]
  status: string[]
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
  host: string | null
  port: number | null
  subject_cn: string | null
  signature_algorithm: string | null
  key_size: number | null
  serial_number: string | null
  last_probed_at: string | null
  created_at: string
  updated_at: string
}

export interface SSLProbeResult {
  certificate: SSLCertificate
  tls_version: string | null
  cipher: string | null
  is_expired: boolean
  days_until_expiry: number
}

export interface DnsLookupResult {
  hostname: string
  a: string[]
  aaaa: string[]
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
  is_baseline: boolean
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
  verify_tls: boolean
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

export interface RegistrarFieldMeta {
  name: string
  label: string
  secret: boolean
  optional: boolean
  placeholder: string
}

export interface RegistrarProviderStatus {
  key: string
  label: string
  fields: RegistrarFieldMeta[]
  set_fields: string[]
  configured: boolean
  supports_dns: boolean
}

export interface DnsRecord {
  id: string | null
  name: string
  type: string
  content: string
  ttl: number | null
  prio: number | null
  disabled: boolean
  root_name: string | null
  change_date: string | null
}

export interface DnsRecordInput {
  name: string
  type: string
  content: string
  ttl: number | null
  prio: number | null
  disabled: boolean
}

export interface RegistrarTestResult {
  success: boolean
  domain_count: number
  error: string | null
}

export interface RegistrarDomain {
  name: string
  provider: string
  provider_label: string
  expiration_date: string | null
  auto_renew: boolean | null
  status: string | null
  days_until_expiry: number | null
  supports_dns: boolean
}

export interface RegistrarDomainsResponse {
  configured: string[]
  domains: RegistrarDomain[]
  errors: Record<string, string>
}

export interface UptimeSettings {
  url: string | null
  api_key_set: boolean
  configured: boolean
}

export interface UptimeMonitor {
  id: string
  name: string
  type: string | null
  url: string | null
  hostname: string | null
  port: string | null
  status: number | null
  status_label: string
  response_time: number | null
  cert_days_remaining: number | null
  cert_is_valid: boolean | null
}

export interface UptimeSummary {
  total: number
  up: number
  down: number
  pending: number
  maintenance: number
}

export interface UptimeMonitorsResponse {
  configured: boolean
  monitors: UptimeMonitor[]
  summary: UptimeSummary
  error: string | null
}

export interface System {
  id: string
  name: string
  slug: string
  category: string | null
  short_description: string | null
  body: string | null
  tags: string[]
  snippets: Record<string, unknown>
  palace_drawer_ids: string[]
  status: 'draft' | 'active' | 'archived' | string
  color: string | null
  icon: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface SystemChatUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  model?: string
  [k: string]: unknown
}

export interface SystemChatMessage {
  id: string
  system_id: string
  role: 'user' | 'assistant'
  content: Array<Record<string, unknown>>
  usage?: SystemChatUsage | null
  created_at: string
}

export interface SystemToolEvent {
  name: string
  input: Record<string, unknown>
  output: unknown
}

export type TaskStatus = 'idea' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'archived'
export type TaskPriority = 'low' | 'med' | 'high'

export interface Task {
  id: string
  parent_id: string | null
  organization_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority | null
  due_date: string | null
  position: number
  completed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  child_count: number
}

export type FirewallRuleStatus = 'active' | 'pending' | 'removed'
export type FirewallRuleDirection = 'inbound' | 'outbound'
export type FirewallRuleProtocol = 'TCP' | 'UDP' | 'TCP+UDP' | 'ICMP' | 'Any'

export interface FirewallRule {
  id: string
  organization_id: string | null
  configuration_id: string | null
  name: string
  direction: FirewallRuleDirection
  external_port: string
  internal_host: string
  internal_port: string | null
  protocol: FirewallRuleProtocol
  business_need: string
  approved_by: string
  approved_date: string
  review_period_months: number
  next_review_date: string
  last_reviewed_date: string | null
  status: FirewallRuleStatus
  removed_date: string | null
  notes: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  organization_name: string | null
  configuration_name: string | null
  days_until_review: number | null
}

export interface FirewallRuleStats {
  total: number
  active: number
  overdue: number
  due_soon: number
}

export type CloudServiceType = 'IaaS' | 'PaaS' | 'SaaS'
export type CloudServiceStatus = 'active' | 'pending' | 'retired'
export type DataClassification = 'none' | 'public' | 'internal' | 'confidential' | 'personal'

export interface CloudService {
  id: string
  organization_id: string | null
  name: string
  vendor: string
  service_type: CloudServiceType
  url: string | null
  business_purpose: string
  data_classification: DataClassification
  admin_count: number
  user_count: number | null
  mfa_enforced: boolean
  sso_enabled: boolean
  billing_owner: string | null
  monthly_cost_gbp: number | null  // pence
  ce_in_scope: boolean
  last_reviewed_date: string | null
  review_period_months: number
  next_review_date: string
  status: CloudServiceStatus
  notes: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  organization_name: string | null
  days_until_review: number | null
}

export interface CloudServiceStats {
  total: number
  active: number
  no_mfa: number
  overdue: number
  due_soon: number
  monthly_cost_pence: number
}

export interface SystemChatTurn {
  assistant_text: string
  tool_events: SystemToolEvent[]
  system: System
  user_message: SystemChatMessage
  assistant_message: SystemChatMessage
}

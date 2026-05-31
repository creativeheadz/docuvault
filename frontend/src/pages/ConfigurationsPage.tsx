import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConfigurations, createConfiguration, updateConfiguration, deleteConfiguration, getFleetReadiness,
} from '@/api/configurations'
import { getOrganizations } from '@/api/organizations'
import { dnsLookup } from '@/api/dns'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  Server, Plus, Pencil, Trash2, Monitor, Terminal, Wand2, Loader2,
  ShieldCheck, ShieldOff, ShieldAlert, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { Configuration, DeviceRole, MalwareProtection } from '@/types'
import { getMeshRemoteUrls } from '@/api/meshcentral'
import { MeshStatusBadge } from '@/components/ui/MeshStatusBadge'
import toast from 'react-hot-toast'

const DEVICE_ROLES: DeviceRole[] = ['employee', 'admin', 'byod', 'server', 'network']
const MALWARE_OPTIONS: { value: MalwareProtection; label: string }[] = [
  { value: 'defender', label: 'Windows Defender / built-in' },
  { value: 'allowlist', label: 'Application allow-listing' },
  { value: 'thirdparty', label: 'Third-party AV' },
  { value: 'none', label: 'None' },
]

interface FormState {
  name: string
  organization_id: string
  configuration_type: string
  hostname: string
  ip_address: string
  serial_number: string
  operating_system: string
  manufacturer: string
  model: string
  notes: string
  ce_in_scope: boolean
  device_role: DeviceRole | ''
  software_firewall_on: 'yes' | 'no' | 'unknown'
  malware_protection: MalwareProtection | ''
  os_eol_date: string
  last_patched_date: string
}

const emptyForm = (): FormState => ({
  name: '',
  organization_id: '',
  configuration_type: '',
  hostname: '',
  ip_address: '',
  serial_number: '',
  operating_system: '',
  manufacturer: '',
  model: '',
  notes: '',
  ce_in_scope: true,
  device_role: '',
  software_firewall_on: 'unknown',
  malware_protection: '',
  os_eol_date: '',
  last_patched_date: '',
})

const formToPayload = (f: FormState) => ({
  name: f.name,
  organization_id: f.organization_id,
  configuration_type: f.configuration_type || null,
  hostname: f.hostname || null,
  ip_address: f.ip_address || null,
  serial_number: f.serial_number || null,
  operating_system: f.operating_system || null,
  manufacturer: f.manufacturer || null,
  model: f.model || null,
  notes: f.notes || null,
  ce_in_scope: f.ce_in_scope,
  device_role: f.device_role || null,
  software_firewall_on: f.software_firewall_on === 'unknown' ? null : f.software_firewall_on === 'yes',
  malware_protection: f.malware_protection || null,
  os_eol_date: f.os_eol_date || null,
  last_patched_date: f.last_patched_date || null,
})

/** Per-row CE readiness badge: ok | warn | bad | unknown */
function ceStatus(c: Configuration): { tone: 'ok' | 'warn' | 'bad' | 'unknown'; reasons: string[] } {
  if (!c.ce_in_scope) return { tone: 'unknown', reasons: ['Out of scope'] }
  const today = new Date().toISOString().slice(0, 10)
  const reasons: string[] = []
  let bad = false
  if (c.os_eol_date && c.os_eol_date <= today) { reasons.push('OS past EOL'); bad = true }
  if (c.software_firewall_on === false) { reasons.push('Software firewall OFF'); bad = true }
  if (c.malware_protection === 'none') { reasons.push('No malware protection'); bad = true }

  let warn = false
  if (c.software_firewall_on === null) { reasons.push('Firewall state unknown'); warn = true }
  if (c.malware_protection === null) { reasons.push('Malware protection unrecorded'); warn = true }
  if (c.last_patched_date) {
    const patched = new Date(c.last_patched_date)
    const days = Math.floor((Date.now() - patched.getTime()) / 86400000)
    if (days > 30) { reasons.push(`Last patched ${days}d ago`); warn = true }
  } else {
    reasons.push('No patch date recorded')
    warn = true
  }
  if (c.os_eol_date && c.os_eol_date > today) {
    const eol = new Date(c.os_eol_date)
    const days = Math.floor((eol.getTime() - Date.now()) / 86400000)
    if (days <= 180) { reasons.push(`OS EOL in ${days}d`); warn = true }
  }

  if (bad) return { tone: 'bad', reasons }
  if (warn) return { tone: 'warn', reasons }
  return { tone: 'ok', reasons: ['All CE checks pass'] }
}

function CEBadge({ config }: { config: Configuration }) {
  const { tone, reasons } = ceStatus(config)
  const title = reasons.join(' · ')
  if (tone === 'unknown') return <span className="text-xxs px-1.5 py-0.5 rounded border border-line text-ink-faint" title={title}>—</span>
  if (tone === 'ok') return <span title={title} className="inline-flex items-center gap-1 text-xxs px-1.5 py-0.5 rounded border border-ok/40 text-ok"><ShieldCheck className="h-3 w-3" />ok</span>
  if (tone === 'warn') return <span title={title} className="inline-flex items-center gap-1 text-xxs px-1.5 py-0.5 rounded border border-warn text-warn"><ShieldAlert className="h-3 w-3" />check</span>
  return <span title={title} className="inline-flex items-center gap-1 text-xxs px-1.5 py-0.5 rounded border border-bad text-bad"><ShieldOff className="h-3 w-3" />fix</span>
}

export default function ConfigurationsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Configuration | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [resolving, setResolving] = useState(false)
  const [ceFormOpen, setCeFormOpen] = useState(false)

  const resolveHostname = async () => {
    const host = form.hostname.trim()
    if (!host) return
    setResolving(true)
    try {
      const result = await dnsLookup(host)
      const ips = [...result.a, ...result.aaaa]
      if (ips.length === 0) {
        toast.error('No DNS records found')
        return
      }
      setForm((f) => ({ ...f, ip_address: result.a[0] || result.aaaa[0] }))
      if (ips.length > 1) toast.success(`Resolved to ${ips[0]} (+${ips.length - 1} more)`)
      else toast.success(`Resolved to ${ips[0]}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Lookup failed'
      toast.error(msg)
    } finally {
      setResolving(false)
    }
  }

  const { data: configs = [], isLoading } = useQuery({ queryKey: ['configurations'], queryFn: () => getConfigurations() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })
  const { data: fleet } = useQuery({ queryKey: ['configurations', 'fleet-readiness'], queryFn: getFleetReadiness })

  const errorDetail = (err: unknown): string => {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
    return 'Unexpected error'
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = formToPayload(form)
      return editing ? updateConfiguration(editing.id, payload) : createConfiguration(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] })
      toast.success(editing ? 'Updated' : 'Created')
      handleClose()
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConfiguration,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['configurations'] }); toast.success('Deleted') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const handleClose = () => {
    setFormOpen(false)
    setEditing(null)
    setForm(emptyForm())
    setCeFormOpen(false)
  }

  const handleEdit = (item: Configuration) => {
    setEditing(item)
    setForm({
      name: item.name,
      organization_id: item.organization_id,
      configuration_type: item.configuration_type || '',
      hostname: item.hostname || '',
      ip_address: item.ip_address || '',
      serial_number: item.serial_number || '',
      operating_system: item.operating_system || '',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      notes: item.notes || '',
      ce_in_scope: item.ce_in_scope,
      device_role: item.device_role || '',
      software_firewall_on: item.software_firewall_on === null ? 'unknown' : item.software_firewall_on ? 'yes' : 'no',
      malware_protection: item.malware_protection || '',
      os_eol_date: item.os_eol_date?.slice(0, 10) || '',
      last_patched_date: item.last_patched_date?.slice(0, 10) || '',
    })
    // Auto-expand CE section if the item has any CE data already
    const hasCeData = item.device_role || item.software_firewall_on !== null || item.malware_protection || item.os_eol_date || item.last_patched_date
    setCeFormOpen(!!hasCeData)
    setFormOpen(true)
  }

  const ceSummary = useMemo(() => {
    if (!fleet) return null
    const trouble = fleet.firewall_off + fleet.os_eol_now + fleet.no_malware_protection
    return { trouble, ...fleet }
  }, [fleet])

  const columns: Column<Configuration>[] = [
    { key: 'name', header: 'Name', render: (i) => <span className="font-medium">{i.name}</span> },
    { key: 'configuration_type', header: 'Type', render: (i) => i.configuration_type || '—' },
    { key: 'hostname', header: 'Hostname', render: (i) => <span className="font-mono text-xs">{i.hostname || '—'}</span> },
    { key: 'ip_address', header: 'IP', render: (i) => <span className="font-mono text-xs">{i.ip_address || '—'}</span> },
    { key: 'operating_system', header: 'OS', render: (i) => i.operating_system || '—' },
    { key: 'ce', header: 'CE', className: 'w-20', render: (i) => <CEBadge config={i} /> },
    { key: 'status', header: 'Status', render: (i) => <MeshStatusBadge config={i} /> },
    { key: 'actions', header: '', className: 'w-36', render: (i) => (
      <div className="flex gap-1">
        {i.mesh_node_id && (
          <>
            <button
              onClick={async (e) => { e.stopPropagation(); try { const urls = await getMeshRemoteUrls(i.id); if (urls.desktop) window.open(urls.desktop, '_blank') } catch { toast.error('Failed to get remote URL') } }}
              className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Remote Desktop"
            ><Monitor className="h-4 w-4 text-blue-500" /></button>
            <button
              onClick={async (e) => { e.stopPropagation(); try { const urls = await getMeshRemoteUrls(i.id); if (urls.terminal) window.open(urls.terminal, '_blank') } catch { toast.error('Failed to get remote URL') } }}
              className="p-1 hover:bg-green-50 dark:hover:bg-green-900/20 rounded" title="Terminal"
            ><Terminal className="h-4 w-4 text-green-500" /></button>
          </>
        )}
        <button onClick={(e) => { e.stopPropagation(); handleEdit(i) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil className="h-4 w-4 text-gray-400" /></button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(i.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Trash2 className="h-4 w-4 text-red-400" /></button>
      </div>
    )},
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurations</h1>
        <Button onClick={() => { setForm(emptyForm()); setFormOpen(true) }}><Plus className="h-4 w-4 mr-2" />New Configuration</Button>
      </div>

      {ceSummary && ceSummary.in_scope > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <StatCard label="In CE scope" value={ceSummary.in_scope} />
          <StatCard label="OS at EOL" value={ceSummary.os_eol_now} tone={ceSummary.os_eol_now > 0 ? 'bad' : 'ok'} />
          <StatCard label="EOL in 6mo" value={ceSummary.os_eol_soon} tone={ceSummary.os_eol_soon > 0 ? 'warn' : 'ok'} />
          <StatCard label="Firewall off / unknown" value={ceSummary.firewall_off + ceSummary.no_firewall_data} tone={ceSummary.firewall_off > 0 ? 'bad' : ceSummary.no_firewall_data > 0 ? 'warn' : 'ok'} />
          <StatCard label="No malware protection" value={ceSummary.no_malware_protection} tone={ceSummary.no_malware_protection > 0 ? 'bad' : 'ok'} />
        </div>
      )}

      <div className="card">
        <DataTable columns={columns} data={configs} loading={isLoading} emptyMessage="No configurations yet" emptyIcon={<Server className="h-12 w-12" />} />
      </div>

      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Configuration' : 'New Configuration'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Organization</label>
              <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
                <option value="">Select...</option>
                {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Type" value={form.configuration_type} onChange={(e) => setForm({ ...form, configuration_type: e.target.value })} placeholder="e.g., Server, Workstation, Switch" />
            <div className="relative">
              <Input
                label="Hostname"
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                onBlur={() => { if (form.hostname && !form.ip_address) resolveHostname() }}
              />
              {form.hostname && (
                <button
                  type="button"
                  onClick={resolveHostname}
                  disabled={resolving}
                  className="absolute right-2 top-[28px] p-1 hover:bg-[var(--ember-wash)] rounded transition-colors disabled:opacity-50"
                  title="Resolve hostname to IP via DNS"
                >
                  {resolving
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--ember)' }} />
                    : <Wand2 className="h-3.5 w-3.5" style={{ color: 'var(--ember)' }} />}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="IP Address"
              value={form.ip_address}
              onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
              hint={resolving ? 'Resolving…' : undefined}
            />
            <Input label="Serial Number" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="OS" value={form.operating_system} onChange={(e) => setForm({ ...form, operating_system: e.target.value })} />
            <Input label="Manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            <Input label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>

          {/* CE Evidence section (collapsible) */}
          <div className="border border-line rounded-lg">
            <button
              type="button"
              onClick={() => setCeFormOpen(!ceFormOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              <span className="flex items-center gap-2">
                {ceFormOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <ShieldCheck className="h-4 w-4 text-ember" />
                Cyber Essentials evidence
              </span>
              <span className="text-xs text-ink-faint">{form.ce_in_scope ? 'in scope' : 'out of scope'}</span>
            </button>
            {ceFormOpen && (
              <div className="p-4 border-t border-line space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm pt-6">
                    <input
                      type="checkbox"
                      checked={form.ce_in_scope}
                      onChange={(e) => setForm({ ...form, ce_in_scope: e.target.checked })}
                    />
                    In Cyber Essentials scope
                  </label>
                  <div>
                    <label className="block text-sm font-medium mb-1">Device role</label>
                    <select
                      value={form.device_role}
                      onChange={(e) => setForm({ ...form, device_role: e.target.value as DeviceRole | '' })}
                      className="input-field"
                    >
                      <option value="">— Not set —</option>
                      {DEVICE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Software firewall</label>
                    <select
                      value={form.software_firewall_on}
                      onChange={(e) => setForm({ ...form, software_firewall_on: e.target.value as 'yes' | 'no' | 'unknown' })}
                      className="input-field"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="yes">On (e.g. Windows Defender Firewall)</option>
                      <option value="no">Off</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Malware protection</label>
                    <select
                      value={form.malware_protection}
                      onChange={(e) => setForm({ ...form, malware_protection: e.target.value as MalwareProtection | '' })}
                      className="input-field"
                    >
                      <option value="">— Not set —</option>
                      {MALWARE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">OS end-of-life date</label>
                    <input
                      type="date"
                      value={form.os_eol_date}
                      onChange={(e) => setForm({ ...form, os_eol_date: e.target.value })}
                      className="input-field"
                    />
                    <p className="text-xxs text-ink-faint mt-1">e.g. Windows 10 → 2025-10-14</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last patched on</label>
                    <input
                      type="date"
                      value={form.last_patched_date}
                      onChange={(e) => setForm({ ...form, last_patched_date: e.target.value })}
                      className="input-field"
                    />
                    <p className="text-xxs text-ink-faint mt-1">CE asks for criticals within 14 days of release</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneColor = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink'
  const icon = tone === 'bad' ? <AlertTriangle className="h-3 w-3" /> : null
  return (
    <div className="bg-surface-raised border border-line rounded-lg p-3">
      <div className="text-xxs font-mono uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`text-2xl font-semibold mt-1 flex items-center gap-2 ${toneColor}`}>{value}{icon}</div>
    </div>
  )
}

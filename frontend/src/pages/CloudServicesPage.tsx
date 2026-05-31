import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCloudServices, createCloudService, updateCloudService, deleteCloudService,
  reviewCloudService, getCloudServicesStats, exportCloudServicesCsvUrl,
} from '@/api/cloud-services'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  Cloud, Plus, Pencil, Trash2, AlertTriangle, Clock, Download, CheckCircle2,
  ShieldOff, ShieldCheck, ExternalLink,
} from 'lucide-react'
import type {
  CloudService, CloudServiceStatus, CloudServiceType, DataClassification,
} from '@/types'
import toast from 'react-hot-toast'

const TYPES: CloudServiceType[] = ['SaaS', 'PaaS', 'IaaS']
const STATUSES: CloudServiceStatus[] = ['active', 'pending', 'retired']
const CLASSIFICATIONS: DataClassification[] = ['none', 'public', 'internal', 'confidential', 'personal']

const CLASSIFICATION_TONE: Record<DataClassification, string> = {
  none: 'text-ink-faint border-line',
  public: 'text-ink-dim border-line',
  internal: 'text-info border-info/40',
  confidential: 'text-warn border-warn',
  personal: 'text-bad border-bad',
}

interface FormState {
  name: string
  vendor: string
  service_type: CloudServiceType
  url: string
  business_purpose: string
  data_classification: DataClassification
  organization_id: string
  admin_count: number
  user_count: string
  mfa_enforced: boolean
  sso_enabled: boolean
  billing_owner: string
  monthly_cost_gbp: string  // entered in £, converted to pence on submit
  ce_in_scope: boolean
  last_reviewed_date: string
  review_period_months: number
  next_review_date: string
  status: CloudServiceStatus
  notes: string
}

const emptyForm = (): FormState => ({
  name: '',
  vendor: '',
  service_type: 'SaaS',
  url: '',
  business_purpose: '',
  data_classification: 'internal',
  organization_id: '',
  admin_count: 1,
  user_count: '',
  mfa_enforced: false,
  sso_enabled: false,
  billing_owner: '',
  monthly_cost_gbp: '',
  ce_in_scope: true,
  last_reviewed_date: '',
  review_period_months: 12,
  next_review_date: '',
  status: 'active',
  notes: '',
})

function ReviewBadge({ service }: { service: CloudService }) {
  if (service.status !== 'active') {
    return <span className="text-xs px-1.5 py-0.5 rounded border border-line text-ink-faint">{service.status}</span>
  }
  const days = service.days_until_review ?? 999
  if (days < 0) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border border-bad text-bad flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />Overdue {Math.abs(days)}d
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border border-warn text-warn flex items-center gap-1">
        <Clock className="h-3 w-3" />Due in {days}d
      </span>
    )
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded border border-ok/40 text-ok flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3" />{days}d
    </span>
  )
}

export default function CloudServicesPage() {
  const queryClient = useQueryClient()
  const [orgFilter, setOrgFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<CloudServiceStatus | 'all'>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CloudService | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })

  const { data: stats } = useQuery({ queryKey: ['cloud-services', 'stats'], queryFn: getCloudServicesStats })

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['cloud-services', orgFilter, statusFilter, overdueOnly, includeArchived],
    queryFn: () => getCloudServices({
      organization_id: orgFilter || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      overdue_only: overdueOnly || undefined,
      include_archived: includeArchived,
    }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cloud-services'] })

  const submitMut = useMutation({
    mutationFn: () => {
      const pence = form.monthly_cost_gbp.trim()
        ? Math.round(parseFloat(form.monthly_cost_gbp) * 100)
        : null
      const payload: Partial<CloudService> = {
        name: form.name,
        vendor: form.vendor,
        service_type: form.service_type,
        url: form.url || null,
        business_purpose: form.business_purpose,
        data_classification: form.data_classification,
        organization_id: form.organization_id || null,
        admin_count: form.admin_count,
        user_count: form.user_count ? Number(form.user_count) : null,
        mfa_enforced: form.mfa_enforced,
        sso_enabled: form.sso_enabled,
        billing_owner: form.billing_owner || null,
        monthly_cost_gbp: pence,
        ce_in_scope: form.ce_in_scope,
        last_reviewed_date: form.last_reviewed_date || null,
        review_period_months: form.review_period_months,
        next_review_date: form.next_review_date || undefined,
        status: form.status,
        notes: form.notes || null,
      }
      return editing ? updateCloudService(editing.id, payload) : createCloudService(payload)
    },
    onSuccess: () => {
      invalidate()
      setFormOpen(false)
      setEditing(null)
      toast.success(editing ? 'Service updated' : 'Service added to register')
    },
    onError: () => toast.error('Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCloudService(id),
    onSuccess: () => { invalidate(); toast.success('Removed') },
  })

  const reviewMut = useMutation({
    mutationFn: (id: string) => reviewCloudService(id, {}),
    onSuccess: () => { invalidate(); toast.success('Marked reviewed') },
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (s: CloudService) => {
    setEditing(s)
    setForm({
      name: s.name,
      vendor: s.vendor,
      service_type: s.service_type,
      url: s.url || '',
      business_purpose: s.business_purpose,
      data_classification: s.data_classification,
      organization_id: s.organization_id || '',
      admin_count: s.admin_count,
      user_count: s.user_count?.toString() || '',
      mfa_enforced: s.mfa_enforced,
      sso_enabled: s.sso_enabled,
      billing_owner: s.billing_owner || '',
      monthly_cost_gbp: s.monthly_cost_gbp ? (s.monthly_cost_gbp / 100).toFixed(2) : '',
      ce_in_scope: s.ce_in_scope,
      last_reviewed_date: s.last_reviewed_date?.slice(0, 10) || '',
      review_period_months: s.review_period_months,
      next_review_date: s.next_review_date.slice(0, 10),
      status: s.status,
      notes: s.notes || '',
    })
    setFormOpen(true)
  }

  const summary = useMemo(() => ({
    total: stats?.total ?? services.length,
    active: stats?.active ?? services.filter(s => s.status === 'active').length,
    no_mfa: stats?.no_mfa ?? services.filter(s => s.status === 'active' && !s.mfa_enforced).length,
    overdue: stats?.overdue ?? services.filter(s => s.status === 'active' && (s.days_until_review ?? 0) < 0).length,
    monthly_pounds: stats ? stats.monthly_cost_pence / 100 : 0,
  }), [stats, services])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cloud Services Register</h1>
          <p className="text-sm text-ink-faint mt-1">
            Cyber Essentials v3.3 — every cloud service that stores or processes organisational data. Cloud services cannot be excluded from scope.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={exportCloudServicesCsvUrl()} target="_blank" rel="noreferrer">
            <Button variant="secondary"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          </a>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add service</Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-5">
        <StatCard label="Total" value={summary.total} />
        <StatCard label="Active" value={summary.active} tone="ok" />
        <StatCard label="No MFA" value={summary.no_mfa} tone={summary.no_mfa > 0 ? 'bad' : 'ok'} />
        <StatCard label="Overdue review" value={summary.overdue} tone={summary.overdue > 0 ? 'bad' : 'ok'} />
        <StatCard label="Monthly spend" value={`£${summary.monthly_pounds.toFixed(2)}`} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-surface-raised border border-line rounded-lg">
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="text-sm bg-surface border border-line rounded px-2 py-1"
        >
          <option value="">All organizations</option>
          {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CloudServiceStatus | 'all')}
          className="text-sm bg-surface border border-line rounded px-2 py-1"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-ink-dim">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>

        <label className="flex items-center gap-1.5 text-sm text-ink-dim">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-ink-faint">Loading…</div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-faint">
          <Cloud className="h-12 w-12 mb-3" />
          <p>No cloud services recorded yet.</p>
          <p className="text-xs mt-2">M365, Anthropic, IONOS, GitHub, Dropbox — anything that stores or processes your data.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-ink-dim text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Service</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Data class</th>
                <th className="px-3 py-2 text-left">Admins</th>
                <th className="px-3 py-2 text-center">MFA</th>
                <th className="px-3 py-2 text-center">SSO</th>
                <th className="px-3 py-2 text-right">£/mo</th>
                <th className="px-3 py-2 text-left">Next review</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-t border-line hover:bg-surface-raised/50">
                  <td className="px-3 py-2 font-medium">
                    <button className="hover:text-ember" onClick={() => openEdit(s)}>{s.name}</button>
                    <div className="text-xxs text-ink-faint flex items-center gap-1">
                      {s.vendor}
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-ember" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{s.service_type}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xxs px-1.5 py-0.5 rounded border uppercase tracking-wider ${CLASSIFICATION_TONE[s.data_classification]}`}>
                      {s.data_classification}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono">{s.admin_count}</td>
                  <td className="px-3 py-2 text-center">
                    {s.mfa_enforced
                      ? <ShieldCheck className="h-4 w-4 text-ok mx-auto" />
                      : <ShieldOff className="h-4 w-4 text-bad mx-auto" />
                    }
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-ink-dim">{s.sso_enabled ? 'yes' : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {s.monthly_cost_gbp != null ? `£${(s.monthly_cost_gbp / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.next_review_date}
                    <div className="mt-1"><ReviewBadge service={s} /></div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => reviewMut.mutate(s.id)}
                      className="p-1 text-ink-faint hover:text-ok"
                      title="Mark reviewed today"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1 text-ink-faint hover:text-ember"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete service "${s.name}"? (Use 'retired' status to keep audit history.)`)) deleteMut.mutate(s.id) }}
                      className="p-1 text-ink-faint hover:text-bad"
                      title="Delete permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit cloud service' : 'New cloud service'} size="xl">
        <form
          onSubmit={(e) => { e.preventDefault(); submitMut.mutate() }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Service name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required autoFocus
              placeholder="Microsoft 365 Business Standard"
            />
            <Input
              label="Vendor"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              required
              placeholder="Microsoft"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label-micro">Service type</label>
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value as CloudServiceType })}
                className="input-field"
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label-micro">Data classification</label>
              <select
                value={form.data_classification}
                onChange={(e) => setForm({ ...form, data_classification: e.target.value as DataClassification })}
                className="input-field"
              >
                {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input
              label="URL / admin portal"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://admin.microsoft.com"
            />
          </div>

          <div>
            <label className="label-micro">Business purpose *</label>
            <textarea
              value={form.business_purpose}
              onChange={(e) => setForm({ ...form, business_purpose: e.target.value })}
              required rows={2}
              className="input-field"
              placeholder="What this service is used for, what data it holds."
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Input
              type="number" min={0}
              label="Admin accounts"
              value={form.admin_count}
              onChange={(e) => setForm({ ...form, admin_count: Number(e.target.value) })}
            />
            <Input
              type="number" min={0}
              label="Total users"
              value={form.user_count}
              onChange={(e) => setForm({ ...form, user_count: e.target.value })}
              placeholder="optional"
            />
            <Input
              type="number" step={0.01} min={0}
              label="Monthly cost (£)"
              value={form.monthly_cost_gbp}
              onChange={(e) => setForm({ ...form, monthly_cost_gbp: e.target.value })}
              placeholder="0.00"
            />
            <Input
              label="Billing owner"
              value={form.billing_owner}
              onChange={(e) => setForm({ ...form, billing_owner: e.target.value })}
              placeholder="Andrei"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.mfa_enforced}
                  onChange={(e) => setForm({ ...form, mfa_enforced: e.target.checked })}
                />
                <ShieldCheck className="h-4 w-4 text-ok" />
                MFA enforced
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sso_enabled}
                  onChange={(e) => setForm({ ...form, sso_enabled: e.target.checked })}
                />
                SSO enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ce_in_scope}
                  onChange={(e) => setForm({ ...form, ce_in_scope: e.target.checked })}
                />
                CE in scope
              </label>
            </div>
            <div>
              <label className="label-micro">Organization</label>
              <select
                value={form.organization_id}
                onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
                className="input-field"
              >
                <option value="">— None —</option>
                {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label-micro">Last reviewed</label>
              <input
                type="date"
                value={form.last_reviewed_date}
                onChange={(e) => setForm({ ...form, last_reviewed_date: e.target.value })}
                className="input-field"
              />
            </div>
            <Input
              type="number" min={1} max={36}
              label="Review every (months)"
              value={form.review_period_months}
              onChange={(e) => setForm({ ...form, review_period_months: Number(e.target.value) })}
            />
            <div>
              <label className="label-micro">Next review {editing ? '' : '(auto if blank)'}</label>
              <input
                type="date"
                value={form.next_review_date}
                onChange={(e) => setForm({ ...form, next_review_date: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label-micro">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CloudServiceStatus })}
              className="input-field"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="label-micro">Notes / review history</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="input-field"
              placeholder="Renewal date, account list, integration details, audit comments."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitMut.isPending}>{editing ? 'Save' : 'Add to register'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneColor = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <div className="bg-surface-raised border border-line rounded-lg p-3">
      <div className="text-xxs font-mono uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneColor}`}>{value}</div>
    </div>
  )
}

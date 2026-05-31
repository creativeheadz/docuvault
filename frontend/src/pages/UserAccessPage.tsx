import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUserAccess, createUserAccess, updateUserAccess, deleteUserAccess,
  reviewUserAccess, getUserAccessStats, getAccessMatrix, exportUserAccessCsvUrl,
} from '@/api/user-access'
import { getContacts } from '@/api/contacts'
import { getCloudServices } from '@/api/cloud-services'
import { getConfigurations } from '@/api/configurations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  UserCheck, Plus, Pencil, Trash2, AlertTriangle, Clock, Download, CheckCircle2,
  ShieldCheck, ShieldOff, Crown,
} from 'lucide-react'
import type {
  UserAccess, AccessPrivilege, PersonCategory, AccessSystemType, AccessMatrixCell, Contact,
} from '@/types'
import toast from 'react-hot-toast'

const PRIVILEGES: AccessPrivilege[] = ['standard', 'admin', 'owner']
const CATEGORIES: PersonCategory[] = ['employee', 'contractor', 'msp', 'vendor', 'customer']

const errorDetail = (err: unknown): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  return 'Unexpected error'
}

interface FormState {
  contact_id: string
  system_kind: 'cloud_service' | 'configuration' | 'custom'
  cloud_service_id: string
  configuration_id: string
  custom_system_label: string
  privilege_level: AccessPrivilege
  person_category: PersonCategory | ''
  mfa_enabled: boolean
  access_granted_date: string
  last_reviewed_date: string
  review_period_months: number
  notes: string
}

const emptyForm = (): FormState => ({
  contact_id: '',
  system_kind: 'cloud_service',
  cloud_service_id: '',
  configuration_id: '',
  custom_system_label: '',
  privilege_level: 'standard',
  person_category: 'employee',
  mfa_enabled: false,
  access_granted_date: '',
  last_reviewed_date: '',
  review_period_months: 6,
  notes: '',
})

function ReviewBadge({ a }: { a: UserAccess }) {
  if (!a.is_active) return <span className="text-xxs px-1.5 py-0.5 rounded border border-line text-ink-faint">inactive</span>
  const days = a.days_until_review ?? 999
  if (days < 0) return <span className="text-xxs px-1.5 py-0.5 rounded border border-bad text-bad flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{Math.abs(days)}d</span>
  if (days <= 30) return <span className="text-xxs px-1.5 py-0.5 rounded border border-warn text-warn flex items-center gap-1"><Clock className="h-3 w-3" />{days}d</span>
  return <span className="text-xxs px-1.5 py-0.5 rounded border border-ok/40 text-ok flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{days}d</span>
}

export default function UserAccessPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'list' | 'matrix'>('list')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserAccess | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [contactFilter, setContactFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const { data: accesses = [], isLoading } = useQuery({
    queryKey: ['user-access', contactFilter, overdueOnly],
    queryFn: () => getUserAccess({
      contact_id: contactFilter || undefined,
      overdue_only: overdueOnly || undefined,
    }),
  })
  const { data: stats } = useQuery({ queryKey: ['user-access', 'stats'], queryFn: getUserAccessStats })
  const { data: matrix } = useQuery({ queryKey: ['user-access', 'matrix'], queryFn: getAccessMatrix })
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => getContacts(),
  })
  const { data: cloudServices = [] } = useQuery({
    queryKey: ['cloud-services', 'for-access'],
    queryFn: () => getCloudServices(),
  })
  const { data: configurations = [] } = useQuery({
    queryKey: ['configurations'],
    queryFn: () => getConfigurations({ page: 1, page_size: 100 }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-access'] })
  }

  const buildPayload = (f: FormState): Partial<UserAccess> => ({
    contact_id: f.contact_id,
    cloud_service_id: f.system_kind === 'cloud_service' ? (f.cloud_service_id || null) : null,
    configuration_id: f.system_kind === 'configuration' ? (f.configuration_id || null) : null,
    custom_system_label: f.system_kind === 'custom' ? (f.custom_system_label || null) : null,
    privilege_level: f.privilege_level,
    person_category: f.person_category || null,
    mfa_enabled: f.mfa_enabled,
    access_granted_date: f.access_granted_date || null,
    last_reviewed_date: f.last_reviewed_date || null,
    review_period_months: f.review_period_months,
    notes: f.notes || null,
  })

  const submitMut = useMutation({
    mutationFn: () => editing
      ? updateUserAccess(editing.id, {
          privilege_level: form.privilege_level,
          person_category: form.person_category || null,
          mfa_enabled: form.mfa_enabled,
          access_granted_date: form.access_granted_date || null,
          last_reviewed_date: form.last_reviewed_date || null,
          review_period_months: form.review_period_months,
          notes: form.notes || null,
        })
      : createUserAccess(buildPayload(form)),
    onSuccess: () => { invalidate(); setFormOpen(false); setEditing(null); toast.success(editing ? 'Updated' : 'Access recorded') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUserAccess(id),
    onSuccess: () => { invalidate(); toast.success('Deleted') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const reviewMut = useMutation({
    mutationFn: (id: string) => reviewUserAccess(id, {}),
    onSuccess: () => { invalidate(); toast.success('Marked reviewed') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const revokeMut = useMutation({
    mutationFn: (id: string) => updateUserAccess(id, { is_active: false }),
    onSuccess: () => { invalidate(); toast.success('Access revoked') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFormOpen(true) }
  const openEdit = (a: UserAccess) => {
    setEditing(a)
    setForm({
      contact_id: a.contact_id,
      system_kind: a.system_type,
      cloud_service_id: a.cloud_service_id || '',
      configuration_id: a.configuration_id || '',
      custom_system_label: a.custom_system_label || '',
      privilege_level: a.privilege_level,
      person_category: a.person_category || '',
      mfa_enabled: a.mfa_enabled,
      access_granted_date: a.access_granted_date?.slice(0, 10) || '',
      last_reviewed_date: a.last_reviewed_date?.slice(0, 10) || '',
      review_period_months: a.review_period_months,
      notes: a.notes || '',
    })
    setFormOpen(true)
  }

  // Matrix lookup
  const cellLookup = useMemo(() => {
    const map = new Map<string, AccessMatrixCell>()
    matrix?.cells.forEach((c) => map.set(`${c.contact_id}|${c.system_key}`, c))
    return map
  }, [matrix])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">User Access Matrix</h1>
          <p className="text-sm text-ink-faint mt-1">
            Cyber Essentials A7 (User Access Control) — who has access to which system, with privilege level and MFA state.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={exportUserAccessCsvUrl()} target="_blank" rel="noreferrer">
            <Button variant="secondary"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          </a>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Record access</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-5">
          <StatCard label="Active accesses" value={stats.active_accesses} />
          <StatCard label="With admin/owner" value={stats.admin_accesses} />
          <StatCard label="Admins w/o MFA" value={stats.no_mfa_admins} tone={stats.no_mfa_admins > 0 ? 'bad' : 'ok'} />
          <StatCard label="No MFA" value={stats.no_mfa} tone={stats.no_mfa > 0 ? 'warn' : 'ok'} />
          <StatCard label="Reviews overdue" value={stats.overdue_reviews} tone={stats.overdue_reviews > 0 ? 'bad' : 'ok'} />
        </div>
      )}

      <div className="flex gap-2 border-b border-line mb-4">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === 'list' ? 'border-ember text-ember' : 'border-transparent text-ink-dim hover:text-ink'}`}
        >
          List
        </button>
        <button
          onClick={() => setTab('matrix')}
          className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === 'matrix' ? 'border-ember text-ember' : 'border-transparent text-ink-dim hover:text-ink'}`}
        >
          Matrix
        </button>
      </div>

      {tab === 'list' && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-surface-raised border border-line rounded-lg">
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className="text-sm bg-surface border border-line rounded px-2 py-1"
            >
              <option value="">All people</option>
              {(contacts as Contact[]).map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ink-dim">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-ink-faint">Loading…</div>
          ) : accesses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-faint">
              <UserCheck className="h-12 w-12 mb-3" />
              <p>No access records yet.</p>
              <p className="text-xs mt-2">Add one entry per person × system to build your CE A7 evidence.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-line rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-surface-raised text-ink-dim text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Person</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">System</th>
                    <th className="px-3 py-2 text-left">Privilege</th>
                    <th className="px-3 py-2 text-center">MFA</th>
                    <th className="px-3 py-2 text-left">Next review</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {accesses.map((a) => (
                    <tr key={a.id} className="border-t border-line hover:bg-surface-raised/50">
                      <td className="px-3 py-2 font-medium">
                        <button className="hover:text-ember" onClick={() => openEdit(a)}>{a.contact_name}</button>
                        {a.contact_email && <div className="text-xxs text-ink-faint">{a.contact_email}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-dim">{a.person_category || '—'}</td>
                      <td className="px-3 py-2">
                        <div>{a.system_label}</div>
                        <div className="text-xxs text-ink-faint">{a.system_type.replace('_', ' ')}</div>
                      </td>
                      <td className="px-3 py-2">
                        <PrivilegeBadge level={a.privilege_level} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {a.mfa_enabled
                          ? <ShieldCheck className="h-4 w-4 text-ok mx-auto" />
                          : <ShieldOff className="h-4 w-4 text-bad mx-auto" />
                        }
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{a.next_review_date}</div>
                        <div className="mt-1"><ReviewBadge a={a} /></div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => reviewMut.mutate(a.id)} className="p-1 text-ink-faint hover:text-ok" title="Mark reviewed today">
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(a)} className="p-1 text-ink-faint hover:text-ember" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {a.is_active && (
                          <button
                            onClick={() => { if (confirm(`Revoke ${a.contact_name}'s access to ${a.system_label}?`)) revokeMut.mutate(a.id) }}
                            className="p-1 text-ink-faint hover:text-warn"
                            title="Revoke (keeps history)"
                          >
                            <ShieldOff className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm('Delete this access record permanently?')) deleteMut.mutate(a.id) }}
                          className="p-1 text-ink-faint hover:text-bad"
                          title="Delete"
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
        </>
      )}

      {tab === 'matrix' && (
        <div>
          {!matrix || matrix.people.length === 0 || matrix.systems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-faint border border-line rounded-lg">
              <UserCheck className="h-12 w-12 mb-3" />
              <p>Add some access records to populate the matrix.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-line rounded-lg">
              <table className="text-xs">
                <thead className="bg-surface-raised">
                  <tr>
                    <th className="text-left px-3 py-2 sticky left-0 bg-surface-raised z-10 min-w-[180px]">Person ↓ / System →</th>
                    {matrix.systems.map((s) => (
                      <th key={s.key} className="px-2 py-2 text-left min-w-[120px]">
                        <div className="font-medium truncate" title={s.name}>{s.name}</div>
                        <div className="text-xxs text-ink-faint">{s.type.replace('_', ' ')}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.people.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-3 py-2 font-medium sticky left-0 bg-surface z-10 min-w-[180px] border-r border-line">
                        {p.name}
                        {p.email && <div className="text-xxs text-ink-faint">{p.email}</div>}
                      </td>
                      {matrix.systems.map((s) => {
                        const cell = cellLookup.get(`${p.id}|${s.key}`)
                        if (!cell) return <td key={s.key} className="px-2 py-2 text-center text-ink-faint">—</td>
                        const overdue = cell.days_until_review < 0
                        return (
                          <td key={s.key} className={`px-2 py-2 text-center ${overdue ? 'bg-bad/10' : ''}`}>
                            <div className="flex items-center justify-center gap-1">
                              <PrivilegeBadge level={cell.privilege_level} compact />
                              {cell.mfa_enabled
                                ? <ShieldCheck className="h-3 w-3 text-ok" />
                                : <ShieldOff className="h-3 w-3 text-bad" />
                              }
                            </div>
                            {overdue && (
                              <div className="text-xxs text-bad mt-0.5">{Math.abs(cell.days_until_review)}d overdue</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xxs text-ink-faint mt-3">
            <PrivilegeBadge level="standard" compact /> standard
            &nbsp;&nbsp;<PrivilegeBadge level="admin" compact /> admin
            &nbsp;&nbsp;<PrivilegeBadge level="owner" compact /> owner
            &nbsp;&nbsp;<ShieldCheck className="h-3 w-3 text-ok inline" /> MFA on
            &nbsp;&nbsp;<ShieldOff className="h-3 w-3 text-bad inline" /> MFA off
          </p>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit access' : 'Record access'} size="lg">
        <form
          onSubmit={(e) => { e.preventDefault(); submitMut.mutate() }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-micro">Person</label>
              <select
                value={form.contact_id}
                onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                className="input-field"
                required
                disabled={!!editing}
              >
                <option value="">Select…</option>
                {(contacts as Contact[]).map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.email ? ` · ${c.email}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-micro">Category</label>
              <select
                value={form.person_category}
                onChange={(e) => setForm({ ...form, person_category: e.target.value as PersonCategory | '' })}
                className="input-field"
              >
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {!editing && (
            <>
              <div>
                <label className="label-micro">System type</label>
                <div className="flex gap-3 text-sm">
                  {(['cloud_service', 'configuration', 'custom'] as AccessSystemType[]).map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="system_kind"
                        checked={form.system_kind === k}
                        onChange={() => setForm({ ...form, system_kind: k })}
                      />
                      {k.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>
              {form.system_kind === 'cloud_service' && (
                <div>
                  <label className="label-micro">Cloud service</label>
                  <select
                    value={form.cloud_service_id}
                    onChange={(e) => setForm({ ...form, cloud_service_id: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select…</option>
                    {cloudServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {form.system_kind === 'configuration' && (
                <div>
                  <label className="label-micro">Configuration / device</label>
                  <select
                    value={form.configuration_id}
                    onChange={(e) => setForm({ ...form, configuration_id: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select…</option>
                    {configurations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {form.system_kind === 'custom' && (
                <Input
                  label="Custom system label"
                  value={form.custom_system_label}
                  onChange={(e) => setForm({ ...form, custom_system_label: e.target.value })}
                  required
                  placeholder="e.g. Stripe dashboard, on-prem PBX"
                />
              )}
            </>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label-micro">Privilege</label>
              <select
                value={form.privilege_level}
                onChange={(e) => setForm({ ...form, privilege_level: e.target.value as AccessPrivilege })}
                className="input-field"
              >
                {PRIVILEGES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.mfa_enabled}
                onChange={(e) => setForm({ ...form, mfa_enabled: e.target.checked })}
              />
              <ShieldCheck className="h-4 w-4 text-ok" />
              MFA enabled
            </label>
            <Input
              type="number" min={1} max={36}
              label="Review every (months)"
              value={form.review_period_months}
              onChange={(e) => setForm({ ...form, review_period_months: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-micro">Access granted on</label>
              <input
                type="date"
                value={form.access_granted_date}
                onChange={(e) => setForm({ ...form, access_granted_date: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-micro">Last reviewed on</label>
              <input
                type="date"
                value={form.last_reviewed_date}
                onChange={(e) => setForm({ ...form, last_reviewed_date: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label-micro">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="input-field"
              placeholder="Account username, granted by, scope of access, exceptions."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitMut.isPending}>{editing ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function PrivilegeBadge({ level, compact }: { level: AccessPrivilege; compact?: boolean }) {
  const cls = level === 'owner'
    ? 'border-bad text-bad'
    : level === 'admin'
      ? 'border-warn text-warn'
      : 'border-line text-ink-dim'
  const icon = level !== 'standard' ? <Crown className="h-3 w-3" /> : null
  if (compact) {
    return <span className={`text-xxs px-1 py-0.5 rounded border ${cls} inline-flex items-center gap-0.5`}>{icon}{level[0].toUpperCase()}</span>
  }
  return <span className={`text-xxs px-1.5 py-0.5 rounded border ${cls} inline-flex items-center gap-1`}>{icon}{level}</span>
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneColor = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <div className="bg-surface-raised border border-line rounded-lg p-3">
      <div className="text-xxs font-mono uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneColor}`}>{value}</div>
    </div>
  )
}

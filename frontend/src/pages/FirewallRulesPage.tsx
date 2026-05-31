import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFirewallRules, createFirewallRule, updateFirewallRule, deleteFirewallRule,
  reviewFirewallRule, getFirewallRulesStats, exportFirewallRulesCsvUrl,
} from '@/api/firewall-rules'
import { getOrganizations } from '@/api/organizations'
import { getConfigurations } from '@/api/configurations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  Shield, Plus, Pencil, Trash2, AlertTriangle, Clock, Download, CheckCircle2,
} from 'lucide-react'
import type {
  FirewallRule, FirewallRuleStatus, FirewallRuleDirection, FirewallRuleProtocol,
} from '@/types'
import toast from 'react-hot-toast'

const DIRECTIONS: FirewallRuleDirection[] = ['inbound', 'outbound']
const PROTOCOLS: FirewallRuleProtocol[] = ['TCP', 'UDP', 'TCP+UDP', 'ICMP', 'Any']
const STATUSES: FirewallRuleStatus[] = ['active', 'pending', 'removed']

interface FormState {
  name: string
  organization_id: string
  configuration_id: string
  direction: FirewallRuleDirection
  external_port: string
  internal_host: string
  internal_port: string
  protocol: FirewallRuleProtocol
  business_need: string
  approved_by: string
  approved_date: string
  review_period_months: number
  next_review_date: string
  status: FirewallRuleStatus
  notes: string
}

const emptyForm = (): FormState => ({
  name: '',
  organization_id: '',
  configuration_id: '',
  direction: 'inbound',
  external_port: '',
  internal_host: '',
  internal_port: '',
  protocol: 'TCP',
  business_need: '',
  approved_by: '',
  approved_date: new Date().toISOString().slice(0, 10),
  review_period_months: 6,
  next_review_date: '',
  status: 'active',
  notes: '',
})

function ReviewBadge({ rule }: { rule: FirewallRule }) {
  if (rule.status !== 'active') {
    return <span className="text-xs px-1.5 py-0.5 rounded border border-line text-ink-faint">{rule.status}</span>
  }
  const days = rule.days_until_review ?? 999
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

export default function FirewallRulesPage() {
  const queryClient = useQueryClient()
  const [orgFilter, setOrgFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<FirewallRuleStatus | 'all'>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FirewallRule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })

  const { data: configs } = useQuery({
    queryKey: ['configurations', 'fwrules'],
    queryFn: () => getConfigurations({ page: 1, page_size: 100 }),
  })

  const { data: stats } = useQuery({ queryKey: ['firewall-rules', 'stats'], queryFn: getFirewallRulesStats })

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['firewall-rules', orgFilter, statusFilter, overdueOnly, includeArchived],
    queryFn: () => getFirewallRules({
      organization_id: orgFilter || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      overdue_only: overdueOnly || undefined,
      include_archived: includeArchived,
    }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['firewall-rules'] })
  }

  const submitMut = useMutation({
    mutationFn: () => {
      const payload: Partial<FirewallRule> = {
        name: form.name,
        organization_id: form.organization_id || null,
        configuration_id: form.configuration_id || null,
        direction: form.direction,
        external_port: form.external_port,
        internal_host: form.internal_host,
        internal_port: form.internal_port || null,
        protocol: form.protocol,
        business_need: form.business_need,
        approved_by: form.approved_by,
        approved_date: form.approved_date,
        review_period_months: form.review_period_months,
        next_review_date: form.next_review_date || undefined,
        status: form.status,
        notes: form.notes || null,
      }
      return editing
        ? updateFirewallRule(editing.id, payload)
        : createFirewallRule(payload)
    },
    onSuccess: () => {
      invalidate()
      setFormOpen(false)
      setEditing(null)
      toast.success(editing ? 'Rule updated' : 'Rule added to register')
    },
    onError: () => toast.error('Save failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFirewallRule(id),
    onSuccess: () => { invalidate(); toast.success('Removed from register') },
  })

  const reviewMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      reviewFirewallRule(id, { notes }),
    onSuccess: () => { invalidate(); toast.success('Marked reviewed') },
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (r: FirewallRule) => {
    setEditing(r)
    setForm({
      name: r.name,
      organization_id: r.organization_id || '',
      configuration_id: r.configuration_id || '',
      direction: r.direction,
      external_port: r.external_port,
      internal_host: r.internal_host,
      internal_port: r.internal_port || '',
      protocol: r.protocol,
      business_need: r.business_need,
      approved_by: r.approved_by,
      approved_date: r.approved_date.slice(0, 10),
      review_period_months: r.review_period_months,
      next_review_date: r.next_review_date.slice(0, 10),
      status: r.status,
      notes: r.notes || '',
    })
    setFormOpen(true)
  }

  const summary = useMemo(() => ({
    total: stats?.total ?? rules.length,
    active: stats?.active ?? rules.filter(r => r.status === 'active').length,
    overdue: stats?.overdue ?? rules.filter(r => r.status === 'active' && (r.days_until_review ?? 0) < 0).length,
    due_soon: stats?.due_soon ?? 0,
  }), [stats, rules])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Firewall Rule Register</h1>
          <p className="text-sm text-ink-faint mt-1">
            Cyber Essentials A4 evidence — every inbound rule on the boundary firewall, with documented business need, approval, and review date.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={exportFirewallRulesCsvUrl()} target="_blank" rel="noreferrer">
            <Button variant="secondary"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          </a>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add rule</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total" value={summary.total} />
        <StatCard label="Active" value={summary.active} tone="ok" />
        <StatCard label="Due in 30 days" value={summary.due_soon} tone="warn" />
        <StatCard label="Overdue" value={summary.overdue} tone="bad" />
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
          onChange={(e) => setStatusFilter(e.target.value as FirewallRuleStatus | 'all')}
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
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-faint">
          <Shield className="h-12 w-12 mb-3" />
          <p>No firewall rules recorded yet.</p>
          <p className="text-xs mt-2">Every inbound port forward on the BT Hub belongs here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-ink-dim text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Ext port</th>
                <th className="px-3 py-2 text-left">Proto</th>
                <th className="px-3 py-2 text-left">Internal target</th>
                <th className="px-3 py-2 text-left">Business need</th>
                <th className="px-3 py-2 text-left">Approved</th>
                <th className="px-3 py-2 text-left">Next review</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-surface-raised/50">
                  <td className="px-3 py-2 font-medium">
                    <button className="hover:text-ember" onClick={() => openEdit(r)}>{r.name}</button>
                    {r.organization_name && (
                      <div className="text-xxs text-ink-faint">{r.organization_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.external_port}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.protocol}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.internal_host}{r.internal_port ? `:${r.internal_port}` : ''}
                    {r.configuration_name && (
                      <div className="text-xxs text-ink-faint font-sans">{r.configuration_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[280px]">
                    <div className="truncate" title={r.business_need}>{r.business_need}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.approved_date}
                    <div className="text-xxs text-ink-faint">{r.approved_by}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.next_review_date}
                    <div className="mt-1"><ReviewBadge rule={r} /></div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={
                      r.status === 'active' ? 'text-ok' :
                      r.status === 'pending' ? 'text-warn' :
                      'text-ink-faint'
                    }>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => reviewMut.mutate({ id: r.id })}
                      className="p-1 text-ink-faint hover:text-ok"
                      title="Mark reviewed today (resets next review date)"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEdit(r)}
                      className="p-1 text-ink-faint hover:text-ember"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete rule "${r.name}"? (Use 'removed' status if you want to keep audit history.)`)) deleteMut.mutate(r.id) }}
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit firewall rule' : 'New firewall rule'} size="xl">
        <form
          onSubmit={(e) => { e.preventDefault(); submitMut.mutate() }}
          className="space-y-4"
        >
          <Input
            label="Rule name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
            placeholder="e.g. Plex Remote Access"
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label-micro">Direction</label>
              <select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as FirewallRuleDirection })}
                className="input-field"
              >
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label-micro">Protocol</label>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value as FirewallRuleProtocol })}
                className="input-field"
              >
                {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <Input
              label="External port"
              value={form.external_port}
              onChange={(e) => setForm({ ...form, external_port: e.target.value })}
              required
              placeholder="32400 or 8080-8090"
            />
            <Input
              label="Internal port (if different)"
              value={form.internal_port}
              onChange={(e) => setForm({ ...form, internal_port: e.target.value })}
              placeholder="optional"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Internal host / IP"
              value={form.internal_host}
              onChange={(e) => setForm({ ...form, internal_host: e.target.value })}
              required
              placeholder="192.168.1.50"
            />
            <div>
              <label className="label-micro">Linked configuration (optional)</label>
              <select
                value={form.configuration_id}
                onChange={(e) => setForm({ ...form, configuration_id: e.target.value })}
                className="input-field"
              >
                <option value="">— None —</option>
                {configs?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label-micro">Documented business need *</label>
            <textarea
              value={form.business_need}
              onChange={(e) => setForm({ ...form, business_need: e.target.value })}
              required
              rows={3}
              className="input-field"
              placeholder="Why this port has to be open from the public internet."
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="Approved by"
              value={form.approved_by}
              onChange={(e) => setForm({ ...form, approved_by: e.target.value })}
              required
              placeholder="Andrei (sole proprietor)"
            />
            <div>
              <label className="label-micro">Approved date</label>
              <input
                type="date"
                value={form.approved_date}
                onChange={(e) => setForm({ ...form, approved_date: e.target.value })}
                required
                className="input-field"
              />
            </div>
            <Input
              type="number"
              min={1}
              max={36}
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

          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="label-micro">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as FirewallRuleStatus })}
                className="input-field"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label-micro">Notes / review history</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="input-field"
              placeholder="Any reviewer comments, exceptions, related tickets."
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

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneColor = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <div className="bg-surface-raised border border-line rounded-lg p-3">
      <div className="text-xxs font-mono uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneColor}`}>{value}</div>
    </div>
  )
}

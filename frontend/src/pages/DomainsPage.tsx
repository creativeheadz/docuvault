import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomains, createDomain, updateDomain, deleteDomain, probeDomain } from '@/api/domains'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Globe, Plus, Pencil, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import type { Domain, DomainProbeResult } from '@/types'
import toast from 'react-hot-toast'

const blank = { domain_name: '', organization_id: '', registrar: '', registration_date: '', expiration_date: '', auto_renew: false, notes: '' }

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function HealthBadge({ date }: { date: string | null }) {
  if (!date) return null
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
  const tone =
    days < 0 ? { color: 'var(--red)', label: 'EXPIRED' }
    : days < 30 ? { color: 'var(--red)', label: `${days}d` }
    : days < 90 ? { color: 'var(--warn)', label: `${days}d` }
    : { color: 'var(--green)', label: `${days}d` }
  return (
    <span className="badge-instrument" style={{ color: tone.color }} title={`${days} days until expiry`}>
      {tone.label}
    </span>
  )
}

function DetailsPanel({ d }: { d: Domain }) {
  const w = (d.whois_data as Record<string, unknown> | null) || {}
  const ns: string[] = Array.isArray((w as { nameservers?: unknown }).nameservers)
    ? ((w as { nameservers: { ldhName?: string }[] }).nameservers
        .map((n) => n.ldhName)
        .filter(Boolean) as string[])
    : []
  const status: string[] = Array.isArray((w as { status?: unknown }).status) ? (w as { status: string[] }).status : []
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5">
      <div className="kicker text-xxs" style={{ color: 'var(--ink-faint)' }}>§ {k}</div>
      <div className="text-xs font-mono break-all" style={{ color: 'var(--ink)' }}>{v ?? '—'}</div>
    </div>
  )
  return (
    <div className="px-6 py-4 -mx-4" style={{ background: 'var(--bg-3)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
        <Row k="last probe" v={formatRelative(d.last_probed_at)} />
        <Row k="registrar" v={d.registrar} />
        <Row k="registered" v={d.registration_date} />
        <Row k="expires" v={d.expiration_date} />
        <Row k="status" v={
          status.length ? (
            <div className="flex flex-wrap gap-1">
              {status.map((s) => <span key={s} className="badge-instrument" style={{ color: 'var(--ink-dim)' }}>{s}</span>)}
            </div>
          ) : '—'
        } />
        <Row k="nameservers" v={
          ns.length ? (
            <div className="flex flex-wrap gap-1">
              {ns.map((n) => <span key={n} className="badge-instrument" style={{ color: 'var(--ink-dim)' }}>{n}</span>)}
            </div>
          ) : '—'
        } />
      </div>
    </div>
  )
}

export default function DomainsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Domain | null>(null)
  const [form, setForm] = useState(blank)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [probing, setProbing] = useState<string | null>(null)

  const { data: domains = [], isLoading } = useQuery({ queryKey: ['domains'], queryFn: () => getDomains() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => editing ? updateDomain(editing.id, data) : createDomain(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['domains'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteDomain,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['domains'] }); toast.success('Deleted') },
  })

  const probe = async (id: string) => {
    setProbing(id)
    try {
      const result: DomainProbeResult = await probeDomain(id)
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      setExpanded(id)
      toast.success(`Probed: ${result.domain.registrar || 'unknown registrar'} · expires ${result.domain.expiration_date || 'unknown'}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (e as { message?: string })?.message || 'Probe failed'
      toast.error(msg)
    } finally {
      setProbing(null)
    }
  }

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm(blank) }
  const handleEdit = (item: Domain) => {
    setEditing(item)
    setForm({
      domain_name: item.domain_name,
      organization_id: item.organization_id,
      registrar: item.registrar || '',
      registration_date: item.registration_date || '',
      expiration_date: item.expiration_date || '',
      auto_renew: item.auto_renew,
      notes: item.notes || '',
    })
    setFormOpen(true)
  }

  const columns: Column<Domain>[] = [
    {
      key: 'expand',
      header: '',
      className: 'w-8',
      render: (i) => (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(expanded === i.id ? null : i.id) }}
          className="p-1 hover:text-[var(--ember)] transition-colors"
          style={{ color: 'var(--ink-faint)' }}
        >
          {expanded === i.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ),
    },
    { key: 'domain_name', header: 'Domain', render: (i) => <span className="font-mono">{i.domain_name}</span> },
    { key: 'registrar', header: 'Registrar', render: (i) => i.registrar || '—' },
    { key: 'expiration_date', header: 'Expires', render: (i) => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{i.expiration_date || '—'}</span>
        <HealthBadge date={i.expiration_date} />
        <StatusBadge date={i.expiration_date} />
      </div>
    )},
    { key: 'auto_renew', header: 'Auto-Renew', render: (i) => i.auto_renew ? 'Yes' : 'No' },
    { key: 'last_probed_at', header: 'Probed', render: (i) => (
      <span className="text-xxs font-mono" style={{ color: i.last_probed_at ? 'var(--ink-dim)' : 'var(--ink-faint)' }}>
        {formatRelative(i.last_probed_at)}
      </span>
    )},
    { key: 'actions', header: '', className: 'w-32', render: (i) => (
      <div className="flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); probe(i.id) }}
          className="p-1 hover:bg-[var(--ember-wash)] rounded transition-colors disabled:opacity-50"
          title="Probe RDAP"
          disabled={probing === i.id}
        >
          <RefreshCw className={`h-4 w-4 ${probing === i.id ? 'animate-spin' : ''}`} style={{ color: 'var(--ember)' }} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleEdit(i) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <Pencil className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(i.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <Trash2 className="h-4 w-4" style={{ color: 'var(--red)' }} />
        </button>
      </div>
    )},
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, unknown> = { ...form }
    if (!data.registration_date) data.registration_date = null
    if (!data.expiration_date) data.expiration_date = null
    saveMutation.mutate(data)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Domain</Button>
      </div>

      <div
        className="mb-4 px-4 py-3 flex items-start gap-2 text-xxs font-mono"
        style={{ background: 'var(--ember-wash)', borderLeft: '3px solid var(--ember)', color: 'var(--ink-dim)' }}
      >
        <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--ember)' }} />
        <span>Click <RefreshCw className="h-3 w-3 inline" style={{ color: 'var(--ember)' }} /> to look up the domain via RDAP and overwrite registrar + expiration with the authoritative values. Works for most TLDs that publish RDAP.</span>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={domains}
          loading={isLoading}
          emptyMessage="No domains tracked"
          emptyIcon={<Globe className="h-12 w-12" />}
          renderExpanded={(i) => expanded === i.id ? <DetailsPanel d={i} /> : null}
        />
      </div>

      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Domain' : 'New Domain'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Domain Name" value={form.domain_name} onChange={(e) => setForm({ ...form, domain_name: e.target.value })} required placeholder="example.com" />
            <Input label="Registrar" value={form.registrar} onChange={(e) => setForm({ ...form, registrar: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Registration Date" type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} />
            <Input label="Expiration Date" type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.auto_renew} onChange={(e) => setForm({ ...form, auto_renew: e.target.checked })} className="rounded border-gray-300" />
            Auto-Renew
          </label>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSSLCertificates,
  createSSLCertificate,
  updateSSLCertificate,
  deleteSSLCertificate,
  probeSSLCertificate,
} from '@/api/sslCertificates'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  ShieldCheck, Plus, Pencil, Trash2, RefreshCw, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react'
import type { SSLCertificate, SSLProbeResult } from '@/types'
import toast from 'react-hot-toast'

const blank = {
  common_name: '', organization_id: '', issuer: '', issued_date: '', expiration_date: '',
  key_algorithm: '', notes: '', host: '', port: '',
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function HealthBadge({ cert }: { cert: SSLCertificate }) {
  if (!cert.expiration_date) return null
  const days = Math.floor((new Date(cert.expiration_date).getTime() - Date.now()) / 86400000)
  const tone =
    days < 0 ? { color: 'var(--red)', label: 'EXPIRED' }
    : days < 14 ? { color: 'var(--red)', label: `${days}d` }
    : days < 45 ? { color: 'var(--warn)', label: `${days}d` }
    : { color: 'var(--green)', label: `${days}d` }
  return (
    <span
      className="badge-instrument"
      style={{ color: tone.color }}
      title={`${days} days until expiry`}
    >
      {tone.label}
    </span>
  )
}

function ChainPanel({ cert }: { cert: SSLCertificate }) {
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5">
      <div className="kicker text-xxs" style={{ color: 'var(--ink-faint)' }}>§ {k}</div>
      <div className="text-xs font-mono break-all" style={{ color: 'var(--ink)' }}>{v ?? '—'}</div>
    </div>
  )
  const probedHost = cert.host && cert.port
    ? `${cert.host}:${cert.port}`
    : cert.host || '—'
  return (
    <div
      className="px-6 py-4 -mx-4"
      style={{ background: 'var(--bg-3)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
        <Row k="probed" v={probedHost} />
        <Row k="last probe" v={formatRelative(cert.last_probed_at)} />
        <Row k="subject" v={cert.subject_cn} />
        <Row k="issuer" v={cert.issuer} />
        <Row k="serial" v={cert.serial_number ? <span className="text-xxs">{cert.serial_number}</span> : '—'} />
        <Row k="signature" v={cert.signature_algorithm} />
        <Row k="key" v={cert.key_size ? `${cert.key_algorithm} · ${cert.key_size} bit` : cert.key_algorithm} />
        <Row k="sans" v={
          (cert.sans?.length || 0) > 0 ? (
            <div className="flex flex-wrap gap-1">
              {cert.sans!.map((s) => (
                <span key={s} className="badge-instrument" style={{ color: 'var(--ink-dim)' }}>{s}</span>
              ))}
            </div>
          ) : '—'
        } />
      </div>
    </div>
  )
}

export default function SSLCertificatesPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SSLCertificate | null>(null)
  const [form, setForm] = useState(blank)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [probing, setProbing] = useState<string | null>(null)

  const { data: certs = [], isLoading } = useQuery({ queryKey: ['ssl-certificates'], queryFn: () => getSSLCertificates() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => editing ? updateSSLCertificate(editing.id, data) : createSSLCertificate(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteSSLCertificate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] }); toast.success('Deleted') },
  })

  const probe = async (id: string) => {
    setProbing(id)
    try {
      const result: SSLProbeResult = await probeSSLCertificate(id)
      queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] })
      setExpanded(id)
      const days = result.days_until_expiry
      if (result.is_expired) toast.error(`Probed: certificate is EXPIRED`)
      else if (days < 14) toast.error(`Probed: expires in ${days}d`)
      else toast.success(`Probed: expires in ${days}d (${result.tls_version})`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (e as { message?: string })?.message
        || 'Probe failed'
      toast.error(msg)
    } finally {
      setProbing(null)
    }
  }

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm(blank) }
  const handleEdit = (item: SSLCertificate) => {
    setEditing(item)
    setForm({
      common_name: item.common_name,
      organization_id: item.organization_id,
      issuer: item.issuer || '',
      issued_date: item.issued_date || '',
      expiration_date: item.expiration_date || '',
      key_algorithm: item.key_algorithm || '',
      notes: item.notes || '',
      host: item.host || '',
      port: item.port ? String(item.port) : '',
    })
    setFormOpen(true)
  }

  const columns: Column<SSLCertificate>[] = [
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
    { key: 'common_name', header: 'Common Name', render: (i) => <span className="font-mono">{i.common_name}</span> },
    { key: 'issuer', header: 'Issuer', render: (i) => i.issuer || '—' },
    { key: 'expiration_date', header: 'Expires', render: (i) => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{i.expiration_date || '—'}</span>
        <HealthBadge cert={i} />
        <StatusBadge date={i.expiration_date} />
      </div>
    )},
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
          title="Probe live certificate"
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
    if (!data.issued_date) data.issued_date = null
    if (!data.expiration_date) data.expiration_date = null
    if (!data.host) data.host = null
    data.port = form.port ? parseInt(form.port, 10) : null
    saveMutation.mutate(data)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SSL Certificates</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Certificate</Button>
      </div>

      <div
        className="mb-4 px-4 py-3 flex items-start gap-2 text-xxs font-mono"
        style={{ background: 'var(--ember-wash)', borderLeft: '3px solid var(--ember)', color: 'var(--ink-dim)' }}
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--ember)' }} />
        <span>
          Click the <RefreshCw className="h-3 w-3 inline" style={{ color: 'var(--ember)' }} /> button to TLS-handshake the host and overwrite stored fields with the live certificate. Host defaults to the common name (wildcards stripped).
        </span>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={certs}
          loading={isLoading}
          emptyMessage="No SSL certificates tracked"
          emptyIcon={<ShieldCheck className="h-12 w-12" />}
          renderExpanded={(i) => expanded === i.id ? <ChainPanel cert={i} /> : null}
        />
      </div>

      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit SSL Certificate' : 'New SSL Certificate'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Common Name" value={form.common_name} onChange={(e) => setForm({ ...form, common_name: e.target.value })} required placeholder="*.example.com" />
            <Input label="Issuer" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Let's Encrypt" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Probe Host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="example.com (overrides common name)" hint="Leave empty to derive from common name" />
            <Input label="Port" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="443" />
            <Input label="Algorithm" value={form.key_algorithm} onChange={(e) => setForm({ ...form, key_algorithm: e.target.value })} placeholder="RSA 2048" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Issued Date" type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
            <Input label="Expiration Date" type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

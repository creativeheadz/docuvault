import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  getDnsRecords,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
} from '@/api/registrars'
import type { DnsRecord, DnsRecordInput } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SRV', 'CAA']
const blank: DnsRecordInput = {
  name: '',
  type: 'A',
  content: '',
  ttl: 3600,
  prio: null,
  disabled: false,
}

type Pending =
  | { kind: 'create'; next: DnsRecordInput }
  | { kind: 'update'; id: string; prev: DnsRecord; next: DnsRecordInput }
  | { kind: 'delete'; id: string; prev: DnsRecord }

function recLine(r: { type: string; name: string; content: string; ttl: number | null; prio: number | null; disabled: boolean }) {
  const prio = r.prio != null ? ` prio=${r.prio}` : ''
  const off = r.disabled ? ' [disabled]' : ''
  return `${r.type}  ${r.name}  →  ${r.content}  (ttl=${r.ttl ?? '—'}${prio})${off}`
}

function EditRow({
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  initial: DnsRecordInput
  onCancel: () => void
  onSubmit: (v: DnsRecordInput) => void
  submitting: boolean
}) {
  const [v, setV] = useState<DnsRecordInput>(initial)
  const showPrio = v.type === 'MX' || v.type === 'SRV'
  const inp =
    'bg-surface-sunken border border-line px-2 py-1 font-mono text-xxs text-ink w-full focus:border-ember outline-none'
  return (
    <tr className="border-b border-line/60 bg-surface-sunken/40">
      <td className="px-2 py-2">
        <select
          className={inp}
          value={v.type}
          onChange={(e) => setV({ ...v, type: e.target.value, prio: e.target.value === 'MX' || e.target.value === 'SRV' ? (v.prio ?? 10) : null })}
        >
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input className={inp} value={v.name} placeholder="sub.example.com" onChange={(e) => setV({ ...v, name: e.target.value })} />
      </td>
      <td className="px-2 py-2">
        <input className={inp} value={v.content} placeholder="target / value" onChange={(e) => setV({ ...v, content: e.target.value })} />
      </td>
      <td className="px-2 py-2 w-20">
        <input className={inp} type="number" value={v.ttl ?? ''} onChange={(e) => setV({ ...v, ttl: e.target.value ? Number(e.target.value) : null })} />
      </td>
      <td className="px-2 py-2 w-16">
        {showPrio ? (
          <input className={inp} type="number" value={v.prio ?? ''} onChange={(e) => setV({ ...v, prio: e.target.value ? Number(e.target.value) : null })} />
        ) : <span className="text-ink-faint text-xxs">—</span>}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <button
          className="text-ember hover:opacity-70 disabled:opacity-40 mr-2"
          disabled={submitting || !v.name || !v.content}
          onClick={() => onSubmit(v)}
          title="Apply"
        >
          <Check className="h-3.5 w-3.5 inline" />
        </button>
        <button className="text-ink-faint hover:text-ink" onClick={onCancel} title="Cancel">
          <X className="h-3.5 w-3.5 inline" />
        </button>
      </td>
    </tr>
  )
}

export default function DnsPanel({
  provider,
  domain,
}: {
  provider: string
  domain: string
}) {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dns', provider, domain],
    queryFn: () => getDnsRecords(provider, domain),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['dns', provider, domain] })

  const mutation = useMutation({
    mutationFn: async (p: Pending) => {
      if (p.kind === 'create') return createDnsRecord(provider, domain, p.next)
      if (p.kind === 'update') return updateDnsRecord(provider, domain, p.id, p.next)
      return deleteDnsRecord(provider, domain, p.id)
    },
    onSuccess: (_d, p) => {
      toast.success(
        p.kind === 'create' ? 'Record created'
        : p.kind === 'update' ? 'Record updated'
        : 'Record deleted',
      )
      setPending(null)
      setEditingId(null)
      setAdding(false)
      invalidate()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'DNS change failed')
    },
  })

  if (isLoading) {
    return <div className="px-6 py-4 font-mono text-xxs text-ink-dim">Loading DNS records…</div>
  }
  if (isError) {
    const msg = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    return <div className="px-6 py-4 font-mono text-xxs text-ember">{msg || 'Could not load DNS records.'}</div>
  }

  const records = data?.records ?? []

  const toInput = (r: DnsRecord): DnsRecordInput => ({
    name: r.name, type: r.type, content: r.content, ttl: r.ttl, prio: r.prio, disabled: r.disabled,
  })

  return (
    <div className="bg-surface-sunken/30 border-t border-line">
      <div className="px-6 py-2 flex items-center justify-between">
        <span className="kicker text-ink-faint">{records.length} DNS records · {domain}</span>
        <button
          className="font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember flex items-center gap-1"
          onClick={() => { setAdding(true); setEditingId(null) }}
        >
          <Plus className="h-3 w-3" /> Add record
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-y border-line/60 text-left">
            {['Type', 'Name', 'Content', 'TTL', 'Prio', ''].map((h, i) => (
              <th key={i} className="px-2 py-1.5 kicker text-ink-faint font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {adding && (
            <EditRow
              initial={blank}
              submitting={mutation.isPending}
              onCancel={() => setAdding(false)}
              onSubmit={(v) => setPending({ kind: 'create', next: v })}
            />
          )}
          {records.map((r) =>
            editingId === r.id ? (
              <EditRow
                key={r.id}
                initial={toInput(r)}
                submitting={mutation.isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => setPending({ kind: 'update', id: r.id as string, prev: r, next: v })}
              />
            ) : (
              <tr key={r.id} className={`border-b border-line/40 ${r.disabled ? 'opacity-50' : ''}`}>
                <td className="px-2 py-1.5 font-mono text-xxs text-ember">{r.type}</td>
                <td className="px-2 py-1.5 font-mono text-xxs text-ink truncate max-w-[180px]">{r.name}</td>
                <td className="px-2 py-1.5 font-mono text-xxs text-ink-dim truncate max-w-[260px]" title={r.content}>{r.content}</td>
                <td className="px-2 py-1.5 font-mono text-xxs text-ink-faint">{r.ttl ?? '—'}</td>
                <td className="px-2 py-1.5 font-mono text-xxs text-ink-faint">{r.prio ?? '—'}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <button
                    className="text-ink-faint hover:text-ember mr-2"
                    title="Edit"
                    onClick={() => { setEditingId(r.id); setAdding(false) }}
                  >
                    <Pencil className="h-3.5 w-3.5 inline" />
                  </button>
                  <button
                    className="text-ink-faint hover:text-ember"
                    title="Delete"
                    onClick={() => setPending({ kind: 'delete', id: r.id as string, prev: r })}
                  >
                    <Trash2 className="h-3.5 w-3.5 inline" />
                  </button>
                </td>
              </tr>
            ),
          )}
          {records.length === 0 && !adding && (
            <tr><td colSpan={6} className="px-6 py-4 text-center font-mono text-xxs text-ink-dim">No records.</td></tr>
          )}
        </tbody>
      </table>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Confirm DNS change"
        size="lg"
      >
        {pending && (
          <div className="space-y-4">
            <p className="font-mono text-xs text-ink-dim">
              This writes to <span className="text-ember">live production DNS</span> for{' '}
              <span className="text-ink">{domain}</span> via {provider.toUpperCase()}.
            </p>
            <div className="space-y-2">
              {pending.kind !== 'create' && (
                <div>
                  <div className="kicker text-ink-faint mb-1">Before</div>
                  <pre className="bg-surface-sunken border border-line p-3 font-mono text-xxs text-ink-dim whitespace-pre-wrap">{recLine(pending.prev)}</pre>
                </div>
              )}
              {pending.kind !== 'delete' && (
                <div>
                  <div className="kicker text-ink-faint mb-1">{pending.kind === 'create' ? 'Create' : 'After'}</div>
                  <pre className="bg-surface-sunken border border-line p-3 font-mono text-xxs text-ink whitespace-pre-wrap">{recLine(pending.next)}</pre>
                </div>
              )}
              {pending.kind === 'delete' && (
                <p className="font-mono text-xs text-ember">This record will be permanently deleted.</p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setPending(null)}>Cancel</Button>
              <Button
                size="sm"
                loading={mutation.isPending}
                onClick={() => mutation.mutate(pending)}
              >
                {pending.kind === 'delete' ? 'Delete record' : 'Apply change'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

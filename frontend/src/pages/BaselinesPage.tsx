import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAllBaselineApplications, applyBaseline, verifyBaselineApplication,
  removeBaselineApplication, getBaselineStats,
} from '@/api/baselines'
import { getChecklists, updateChecklist } from '@/api/checklists'
import { getConfigurations } from '@/api/configurations'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  ClipboardCheck, Plus, Trash2, AlertTriangle, Clock, CheckCircle2,
  ToggleLeft, ToggleRight, ExternalLink,
} from 'lucide-react'
import type { BaselineApplication, Checklist, Configuration } from '@/types'
import toast from 'react-hot-toast'

const errorDetail = (err: unknown): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  return 'Unexpected error'
}

function ReviewBadge({ app }: { app: BaselineApplication }) {
  const days = app.days_until_review ?? 999
  if (days < 0) return (
    <span className="text-xs px-1.5 py-0.5 rounded border border-bad text-bad flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" />Overdue {Math.abs(days)}d
    </span>
  )
  if (days <= 30) return (
    <span className="text-xs px-1.5 py-0.5 rounded border border-warn text-warn flex items-center gap-1">
      <Clock className="h-3 w-3" />Due in {days}d
    </span>
  )
  return (
    <span className="text-xs px-1.5 py-0.5 rounded border border-ok/40 text-ok flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3" />{days}d
    </span>
  )
}

export default function BaselinesPage() {
  const queryClient = useQueryClient()
  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [applyForm, setApplyForm] = useState({ configuration_id: '', checklist_id: '', review_period_months: 6 })

  const { data: applications = [] } = useQuery({
    queryKey: ['baseline-applications'],
    queryFn: getAllBaselineApplications,
  })
  const { data: stats } = useQuery({ queryKey: ['baseline-stats'], queryFn: getBaselineStats })
  const { data: allChecklists = [] } = useQuery({
    queryKey: ['checklists', 'all'],
    queryFn: () => getChecklists({ page_size: 100 }),
  })
  const { data: configurations = [] } = useQuery({
    queryKey: ['configurations'],
    queryFn: () => getConfigurations({ page: 1, page_size: 100 }),
  })

  const baselines = useMemo(
    () => (allChecklists as Checklist[]).filter((c) => c.is_baseline),
    [allChecklists]
  )
  const candidates = useMemo(
    () => (allChecklists as Checklist[]).filter((c) => !c.is_baseline),
    [allChecklists]
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['baseline-applications'] })
    queryClient.invalidateQueries({ queryKey: ['baseline-stats'] })
  }

  const promoteMut = useMutation({
    mutationFn: ({ id, is_baseline }: { id: string; is_baseline: boolean }) => updateChecklist(id, { is_baseline }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] })
      invalidate()
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const applyMut = useMutation({
    mutationFn: () => applyBaseline(applyForm.configuration_id, {
      checklist_id: applyForm.checklist_id,
      review_period_months: applyForm.review_period_months,
    }),
    onSuccess: () => {
      invalidate()
      setApplyModalOpen(false)
      setApplyForm({ configuration_id: '', checklist_id: '', review_period_months: 6 })
      toast.success('Baseline applied')
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const verifyMut = useMutation({
    mutationFn: (id: string) => verifyBaselineApplication(id, {}),
    onSuccess: () => { invalidate(); toast.success('Verified') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => removeBaselineApplication(id),
    onSuccess: () => { invalidate(); toast.success('Baseline removed') },
    onError: (err) => toast.error(errorDetail(err)),
  })

  // Group applications by baseline checklist
  const grouped = useMemo(() => {
    const buckets: Record<string, BaselineApplication[]> = {}
    for (const a of applications) {
      buckets[a.checklist_id] = buckets[a.checklist_id] || []
      buckets[a.checklist_id].push(a)
    }
    return buckets
  }, [applications])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Baselines</h1>
          <p className="text-sm text-ink-faint mt-1">
            Cyber Essentials A5 (Secure Configuration) evidence — apply a baseline checklist to a device and re-verify on a schedule.
          </p>
        </div>
        {baselines.length > 0 && configurations.length > 0 && (
          <Button onClick={() => setApplyModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Apply baseline
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="Baselines" value={stats?.baselines ?? baselines.length} />
        <StatCard label="Applications" value={stats?.total_applications ?? applications.length} />
        <StatCard label="Overdue" value={stats?.overdue ?? 0} tone={(stats?.overdue ?? 0) > 0 ? 'bad' : 'ok'} />
      </div>

      {/* Baseline catalogue: promote/demote */}
      <div className="mb-6">
        <div className="kicker text-ink-faint mb-2">§ Baseline catalogue</div>
        {baselines.length === 0 && candidates.length === 0 ? (
          <div className="border border-line rounded-lg p-6 text-sm text-ink-faint text-center">
            No checklists exist yet. <Link to="/checklists" className="text-ember hover:underline">Create one first</Link> — then promote it here.
          </div>
        ) : (
          <div className="border border-line rounded-lg divide-y divide-line">
            {baselines.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-raised/50">
                <div className="flex items-center gap-3">
                  <ToggleRight className="h-5 w-5 text-ember" />
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-ink-faint">{c.items.length} item{c.items.length === 1 ? '' : 's'} · applied to {grouped[c.id]?.length ?? 0} device{(grouped[c.id]?.length ?? 0) === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/checklists" className="text-xxs text-ink-faint hover:text-ember flex items-center gap-1">
                    edit <ExternalLink className="h-3 w-3" />
                  </Link>
                  <button
                    onClick={() => promoteMut.mutate({ id: c.id, is_baseline: false })}
                    className="text-xs text-ink-faint hover:text-warn px-2 py-1 rounded border border-line"
                    title="Demote — also removes existing applications when the checklist is deleted but keeps current applications for now"
                  >
                    Demote
                  </button>
                </div>
              </div>
            ))}
            {candidates.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-raised/50">
                <div className="flex items-center gap-3">
                  <ToggleLeft className="h-5 w-5 text-ink-faint" />
                  <div>
                    <div className="font-medium text-ink-dim">{c.name}</div>
                    <div className="text-xs text-ink-faint">{c.items.length} item{c.items.length === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <button
                  onClick={() => promoteMut.mutate({ id: c.id, is_baseline: true })}
                  className="text-xs text-ember hover:bg-ember/10 px-2 py-1 rounded border border-ember/40"
                >
                  Promote to baseline
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications grouped by baseline */}
      <div className="kicker text-ink-faint mb-2">§ Applications</div>
      {baselines.length === 0 ? (
        <div className="text-sm text-ink-faint">No baselines to apply yet.</div>
      ) : applications.length === 0 ? (
        <div className="border border-line rounded-lg p-6 text-sm text-ink-faint text-center">
          No baselines have been applied to any device yet. Click "Apply baseline" to start.
        </div>
      ) : (
        <div className="space-y-4">
          {baselines.map((bl) => {
            const apps = grouped[bl.id] || []
            if (apps.length === 0) return null
            return (
              <div key={bl.id} className="border border-line rounded-lg overflow-hidden">
                <div className="bg-surface-raised px-4 py-2 flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-ember" />
                    {bl.name}
                  </div>
                  <span className="text-xs text-ink-faint">{apps.length} device{apps.length === 1 ? '' : 's'}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xxs uppercase tracking-wider text-ink-faint">
                    <tr>
                      <th className="text-left px-4 py-1.5">Device</th>
                      <th className="text-left px-4 py-1.5">Last verified</th>
                      <th className="text-left px-4 py-1.5">Next review</th>
                      <th className="px-4 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((a) => (
                      <tr key={a.id} className="border-t border-line">
                        <td className="px-4 py-2 font-medium">
                          <Link to="/configurations" className="hover:text-ember">{a.configuration_name}</Link>
                        </td>
                        <td className="px-4 py-2 text-xs text-ink-dim">
                          {a.last_verified_date || <span className="text-ink-faint">never</span>}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span>{a.next_review_date}</span>
                            <ReviewBadge app={a} />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => verifyMut.mutate(a.id)}
                            className="p-1 text-ink-faint hover:text-ok"
                            title="Mark verified today"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Remove "${bl.name}" from ${a.configuration_name}?`)) removeMut.mutate(a.id) }}
                            className="p-1 text-ink-faint hover:text-bad"
                            title="Remove application"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={applyModalOpen} onClose={() => setApplyModalOpen(false)} title="Apply baseline">
        <form onSubmit={(e) => { e.preventDefault(); applyMut.mutate() }} className="space-y-4">
          <div>
            <label className="label-micro">Baseline</label>
            <select
              value={applyForm.checklist_id}
              onChange={(e) => setApplyForm({ ...applyForm, checklist_id: e.target.value })}
              className="input-field"
              required
            >
              <option value="">Select a baseline…</option>
              {baselines.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-micro">Device</label>
            <select
              value={applyForm.configuration_id}
              onChange={(e) => setApplyForm({ ...applyForm, configuration_id: e.target.value })}
              className="input-field"
              required
            >
              <option value="">Select a device…</option>
              {(configurations as Configuration[]).filter((c) => c.ce_in_scope).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xxs text-ink-faint mt-1">Only CE-in-scope devices shown.</p>
          </div>
          <div>
            <label className="label-micro">Review every (months)</label>
            <input
              type="number"
              min={1}
              max={36}
              value={applyForm.review_period_months}
              onChange={(e) => setApplyForm({ ...applyForm, review_period_months: Number(e.target.value) })}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setApplyModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={applyMut.isPending}>Apply</Button>
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

import { useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { LayoutGrid, List, Monitor, Network, Plus, Server, Terminal } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { AgentBadges, CEBadge, SOURCES, SourceBadges, StatCard } from '@/components/systems/badges'
import { cn } from '@/lib/utils'
import { createSystem, getFleetReadiness, getSystems } from '@/api/systems'
import { getOrganizations } from '@/api/organizations'
import { getMapPlacements } from '@/api/network-maps'
import { getMeshRemoteUrls } from '@/api/meshcentral'
import type { MapPlacement, System } from '@/types'
import SystemDetailPage from './SystemDetailPage'

const ESTATE = 'estate'
const VIEW_KEY = 'docuvault.systems.view'
type View = 'table' | 'cards'

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'
  } catch {
    return 'table'
  }
}

const errorDetail = (err: unknown): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  return 'Unexpected error'
}

async function openRemote(id: string, kind: 'desktop' | 'terminal') {
  try {
    const urls = await getMeshRemoteUrls(id)
    const url = kind === 'desktop' ? urls.desktop : urls.terminal
    if (url) window.open(url, '_blank', 'noopener')
  } catch {
    toast.error('Could not get a remote session from MeshCentral')
  }
}

function SystemsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const scope = params.get('org') ?? ''
  const source = params.get('source') ?? ''
  const [view, setViewState] = useState<View>(storedView)
  const setView = (v: View) => {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* a private window keeps it for the visit */ }
  }
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ organization_id: '', name: '', category: '', hostname: '', ip_address: '' })

  const { data: systems = [], isLoading } = useQuery({
    queryKey: ['systems', scope, source, search],
    queryFn: () => getSystems({
      search: search || undefined,
      organization_id: scope && scope !== ESTATE ? scope : undefined,
      estate_only: scope === ESTATE || undefined,
      source: source || undefined,
    }),
  })
  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })
  const { data: fleet } = useQuery({ queryKey: ['systems', 'fleet-readiness'], queryFn: getFleetReadiness })
  const { data: placements = [] } = useQuery({
    queryKey: ['network-maps', 'placements'],
    queryFn: () => getMapPlacements(),
  })
  const onMaps = useMemo(() => {
    const m = new Map<string, MapPlacement[]>()
    for (const p of placements) m.set(p.system_id, [...(m.get(p.system_id) ?? []), p])
    return m
  }, [placements])

  // The organisation, then the name: a client's machines read as a block.
  const sorted = useMemo(() => [...systems].sort((a, b) =>
    (a.organization_name ?? '').localeCompare(b.organization_name ?? '') ||
    a.name.localeCompare(b.name, undefined, { numeric: true })), [systems])

  const create = useMutation({
    mutationFn: () => createSystem({
      organization_id: form.organization_id || null,
      name: form.name.trim(),
      category: form.category.trim() || null,
      hostname: form.hostname.trim() || null,
      ip_address: form.ip_address.trim() || null,
      // A platform or vendor is not a machine on anybody's CE scope.
      ce_in_scope: !!form.organization_id,
    }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['systems'] })
      setOpen(false)
      setForm({ organization_id: '', name: '', category: '', hostname: '', ip_address: '' })
      navigate(`/systems/${s.id}`)
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const columns: Column<System>[] = [
    {
      key: 'name', header: 'System', render: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-ink truncate">{s.name}</div>
          {(s.category || s.short_description) && (
            <div className="text-xxs text-ink-faint truncate max-w-[340px]">
              {[s.category, s.short_description].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    { key: 'source', header: 'Source', render: (s) => <SourceBadges system={s} /> },
    {
      key: 'organization', header: 'Organisation', render: (s) => s.organization_name
        ? <span className="text-xs">{s.organization_name}</span>
        : <span className="text-xxs font-mono uppercase tracking-button text-ink-faint">Estate-wide</span>,
    },
    {
      key: 'address', header: 'Address', render: (s) => (
        <div className="font-mono text-xs tnum">
          <div>{s.ip_address || '—'}</div>
          {s.hostname && s.hostname !== s.name && <div className="text-ink-faint">{s.hostname}</div>}
        </div>
      ),
    },
    { key: 'os', header: 'OS', render: (s) => <span className="text-xs">{s.operating_system || '—'}</span> },
    { key: 'ce', header: 'CE', className: 'w-20', render: (s) => <CEBadge system={s} /> },
    { key: 'agents', header: 'Agents', render: (s) => <AgentBadges system={s} /> },
    {
      key: 'actions', header: '', className: 'w-28', render: (s) => (
        <div className="flex gap-1 justify-end">
          {onMaps.get(s.id)?.length ? (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/network-maps/${onMaps.get(s.id)![0].map_id}?focus=${s.id}`) }}
              className="p-1 hover:bg-[var(--ember-wash)]"
              title={`On ${onMaps.get(s.id)!.map((p) => p.map_name).join(', ')}`}
            ><Network className="h-4 w-4" style={{ color: 'var(--ember)' }} /></button>
          ) : null}
          {s.mesh_node_id && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openRemote(s.id, 'desktop') }} className="p-1 hover:bg-[var(--ember-wash)]" title="Remote desktop">
                <Monitor className="h-4 w-4 text-ink-dim" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openRemote(s.id, 'terminal') }} className="p-1 hover:bg-[var(--ember-wash)]" title="Terminal">
                <Terminal className="h-4 w-4 text-ink-dim" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="section-header">
        <div className="flex items-baseline gap-3">
          <span className="kicker text-ink-faint">§ Inventory</span>
          <h1 className="text-3xl font-serif italic" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380' }}>
            Systems.
          </h1>
          <span className="text-xxs font-mono text-ink-faint uppercase tracking-button tnum">{systems.length} shown</span>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="name, host or IP…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <select className="input-field w-56" value={scope} onChange={(e) => setParam('org', e.target.value)}>
            <option value="">Every organisation</option>
            <option value={ESTATE}>Estate-wide only</option>
            {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className="input-field w-40" value={source} onChange={(e) => setParam('source', e.target.value)}>
            <option value="">Every source</option>
            {Object.entries(SOURCES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <div className="flex border border-line-hot" role="group" aria-label="View">
            {([['table', List, 'Dense list'], ['cards', LayoutGrid, 'Cards with more detail']] as const).map(([v, Icon, title]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={title}
                aria-pressed={view === v}
                className={cn('px-2.5 py-2 transition-colors', view === v ? 'text-ember bg-[var(--ember-wash)]' : 'text-ink-faint hover:text-ink')}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <Button onClick={() => { setForm((f) => ({ ...f, organization_id: scope && scope !== ESTATE ? scope : '' })); setOpen(true) }}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>
      </div>

      {fleet && fleet.in_scope > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <StatCard label="In CE scope" value={fleet.in_scope} />
          <StatCard label="OS at end of life" value={fleet.os_eol_now} tone={fleet.os_eol_now > 0 ? 'bad' : 'ok'} />
          <StatCard label="End of life in 6 months" value={fleet.os_eol_soon} tone={fleet.os_eol_soon > 0 ? 'warn' : 'ok'} />
          <StatCard
            label="Firewall off / unknown"
            value={fleet.firewall_off + fleet.no_firewall_data}
            tone={fleet.firewall_off > 0 ? 'bad' : fleet.no_firewall_data > 0 ? 'warn' : 'ok'}
          />
          <StatCard label="No malware protection" value={fleet.no_malware_protection} tone={fleet.no_malware_protection > 0 ? 'bad' : 'ok'} />
        </div>
      )}

      {view === 'table' || isLoading || sorted.length === 0 ? (
        <div className="surface">
          <DataTable
            columns={columns}
            data={sorted}
            loading={isLoading}
            onRowClick={(s) => navigate(`/systems/${s.id}`)}
            emptyMessage={search || scope || source ? 'Nothing matches' : 'No systems yet'}
            emptyIcon={<Server className="h-12 w-12" />}
          />
        </div>
      ) : (
        <SystemCards systems={sorted} onMaps={onMaps} />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New system" size="md">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-4">
          <label className="block">
            <span className="label-micro">Organisation</span>
            <select
              className="input-field"
              value={form.organization_id}
              onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
            >
              <option value="">None: estate-wide (a platform, a vendor)</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={255} />
          <Input
            label="Type"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Workstation, Firewall, Server, Platform, Vendor…"
          />
          {form.organization_id && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Hostname" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
              <Input label="IP address" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
            </div>
          )}
          <p className="text-xxs font-mono text-ink-faint leading-relaxed">
            Everything else (inventory, Cyber Essentials, the documentation) is on the system's own page, where the assistant can help write it.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!form.name.trim()}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/** The detailed view: one card per system, grouped by organisation. */
function SystemCards({ systems, onMaps }: { systems: System[]; onMaps: Map<string, MapPlacement[]> }) {
  const groups = useMemo(() => {
    const out = new Map<string, System[]>()
    for (const s of systems) {
      const key = s.organization_name ?? ''
      out.set(key, [...(out.get(key) ?? []), s])
    }
    return [...out.entries()]
  }, [systems])

  return (
    <div className="space-y-8">
      {groups.map(([org, list]) => (
        <section key={org || 'estate'}>
          <div className="kicker text-ink-faint mb-3">
            § {org || 'Estate-wide'} <span className="tnum">· {list.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((s) => <SystemCard key={s.id} system={s} placements={onMaps.get(s.id) ?? []} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function SystemCard({ system: s, placements }: { system: System; placements: MapPlacement[] }) {
  const hardware = [s.manufacturer, s.model].filter(Boolean).join(' ')
  const facts: [string, string | null][] = [
    ['Address', [s.ip_address, s.hostname && s.hostname !== s.name ? s.hostname : null].filter(Boolean).join(' · ') || null],
    ['OS', [s.operating_system, s.os_version].filter(Boolean).join(' ') || null],
    ['Hardware', hardware || null],
    ['Serial', s.serial_number],
  ]
  const shown = facts.filter(([, v]) => v)
  return (
    <Link to={`/systems/${s.id}`} className="group block">
      <div className="card-instrument h-full flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <SourceBadges system={s} />
          <div className="flex items-center gap-2 shrink-0">
            {(s.mesh_node_id || s.wegweiser_device_id) && <AgentBadges system={s} />}
            {s.organization_id && s.ce_in_scope && <CEBadge system={s} />}
          </div>
        </div>
        <div>
          {s.category && <div className="kicker text-ink-faint mb-1">{s.category}</div>}
          <h3 className="font-serif italic text-xl leading-tight m-0 text-ink" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60, "wght" 400' }}>
            {s.name}
          </h3>
          {s.short_description && <p className="text-xs text-ink-dim mt-1.5 mb-0 line-clamp-2">{s.short_description}</p>}
        </div>
        {shown.length > 0 && (
          <dl className="m-0 grid gap-1">
            {shown.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[72px_1fr] gap-2 text-xs">
                <dt className="text-xxs font-mono uppercase tracking-button text-ink-faint pt-0.5">{k}</dt>
                <dd className="m-0 font-mono text-ink truncate tnum" title={v ?? ''}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {s.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {s.tags.slice(0, 6).map((t) => <span key={t} className="badge-instrument text-ink-faint">{t}</span>)}
          </div>
        )}
        <div className="mt-auto pt-2 border-t border-line flex items-center gap-3 text-xxs font-mono text-ink-faint">
          {placements.length > 0 && (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--ember)' }} title={placements.map((p) => p.map_name).join(', ')}>
              <Network className="h-3 w-3" /> {placements.length === 1 ? placements[0].map_name : `${placements.length} maps`}
            </span>
          )}
          <span className="ml-auto">
            {s.wegweiser_last_seen_at
              ? `seen ${formatDistanceToNow(new Date(s.wegweiser_last_seen_at), { addSuffix: true })}`
              : s.mesh_last_sync_at
                ? `synced ${formatDistanceToNow(new Date(s.mesh_last_sync_at), { addSuffix: true })}`
                : `updated ${formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}`}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function SystemsPage() {
  return (
    <Routes>
      <Route index element={<SystemsList />} />
      <Route path=":id" element={<SystemDetailPage />} />
    </Routes>
  )
}

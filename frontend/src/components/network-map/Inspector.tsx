import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpDown, ChevronUp, CornerDownRight, ExternalLink, Monitor, Plus, SquareDashed,
  Terminal, Trash2, Unlink, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { getMeshRemoteUrls } from '@/api/meshcentral'
import type { LinkKind, Location, MapRecord, NodeKind, ZoneTone } from '@/types'
import {
  COMMON_FUNCTIONS, KIND_GROUPS, LINK_KINDS, LINK_KIND_ORDER, NODE_KINDS, SPEEDS, ZONE_TONES,
  ZONE_TONE_ORDER, nodeName,
} from './catalogue'
import type { DeviceData, DeviceNode, LinkData, LinkEdge, ZoneData, ZoneNode } from './model'
import { LIVE_COLOR, LIVE_LABEL, UNKNOWN, concerns, type Live } from './status'

// ── small parts ──────────────────────────────────────────────────────────

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="nm-section">
      <div className="nm-section-head">
        <span className="kicker">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A text field that records an undo point when you start editing it. */
function Field({
  label, value, onChange, onFocus, placeholder, mono, multiline, autoFocus,
}: {
  label?: string
  value: string | null
  onChange: (v: string) => void
  onFocus: () => void
  placeholder?: string
  mono?: boolean
  multiline?: boolean
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); ref.current?.select() }
  }, [autoFocus])
  const common = {
    ref,
    value: value ?? '',
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onFocus,
    placeholder,
    className: cn('input-field nm-input', mono && 'tnum'),
  }
  return (
    <label className="block">
      {label && <span className="label-micro">{label}</span>}
      {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
    </label>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (!shown.length) return null
  return (
    <dl className="nm-facts">
      {shown.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  )
}

const SOURCE_NAMES: Record<NonNullable<Live['source']>, string> = {
  kuma: 'Uptime Kuma', mesh: 'MeshCentral', wegweiser: 'Wegweiser',
}

function LiveLine({ live }: { live: Live }) {
  return (
    <div className="nm-live-line" style={{ '--live': LIVE_COLOR[live.state] } as CSSProperties}>
      <span className="nm-live-pip" />
      <span className="nm-live-state">{LIVE_LABEL[live.state]}</span>
      <span className="nm-live-src">{live.source ? SOURCE_NAMES[live.source] : ''}</span>
    </div>
  )
}

/** A tiny drawing of a connection's line style, for the medium picker and legend. */
export function LineSwatch({ kind }: { kind: LinkKind }) {
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" className={cn('nm-link', `nm-link--${kind}`, 'nm-swatch')}>
      <path d="M1 5 H33" className="nm-stroke" />
      {kind === 'trunk' && <path d="M1 5 H33" className="nm-gap" />}
    </svg>
  )
}

// ── the panel ────────────────────────────────────────────────────────────

export interface DeviceTools {
  update: (id: string, patch: Partial<DeviceData>) => void
  setGateway: (id: string, gatewayId: string | null) => void
  attachChild: (id: string, kind: NodeKind) => void
  remove: (id: string) => void
  linkRecord: (id: string, recordId: string | null) => void
  promote: (id: string) => Promise<void>
  selectEdge: (id: string) => void
}

export interface LinkTools {
  update: (id: string, patch: Partial<LinkData>) => void
  setRole: (id: string, role: 'uplink' | 'peer') => void
  swap: (id: string) => void
  remove: (id: string) => void
}

export interface ZoneTools {
  update: (id: string, patch: Partial<ZoneData>) => void
  remove: (id: string) => void
}

export interface MapMeta {
  name: string
  description: string | null
  location_id: string | null
  organization_id: string
  organization_name: string | null
}

interface InspectorProps {
  device: DeviceNode | null
  link: LinkEdge | null
  zone: ZoneNode | null
  multi: { devices: number; links: number; zones: number } | null
  devices: DeviceNode[]
  edges: LinkEdge[]
  records: Map<string, MapRecord>
  unplaced: MapRecord[]
  live: Map<string, Live>
  gateways: Map<string, string>
  descendants: (id: string) => Set<string>
  autoFocusId: string | null
  checkpoint: () => void
  deviceTools: DeviceTools
  linkTools: LinkTools
  zoneTools: ZoneTools
  onWrapInZone: () => void
  onRemoveSelection: () => void
  meta: MapMeta
  locations: Location[]
  onMeta: (patch: Partial<Pick<MapMeta, 'name' | 'description' | 'location_id'>>) => void
  stats: { devices: number; links: number; placed: number; records: number; up: number; down: number }
  liveConfigured: boolean
}

export function Inspector(props: InspectorProps) {
  const { device, link, zone, multi } = props
  return (
    <aside className="nm-inspector">
      {device ? <DevicePanel key={device.id} {...props} device={device} />
        : link ? <LinkPanel key={link.id} {...props} link={link} />
        : zone ? <ZonePanel key={zone.id} {...props} zone={zone} />
        : multi ? <MultiPanel {...props} multi={multi} />
        : <MapPanel {...props} />}
    </aside>
  )
}

// ── a device ─────────────────────────────────────────────────────────────

function DevicePanel({
  device, devices, edges, records, unplaced, live, gateways, descendants, autoFocusId, checkpoint, deviceTools: t,
}: InspectorProps & { device: DeviceNode }) {
  const d = device.data
  const record = d.system_id ? records.get(d.system_id) : undefined
  const meta = NODE_KINDS[d.kind] ?? NODE_KINDS.other
  const Icon = meta.icon
  const state = live.get(device.id) ?? UNKNOWN
  const nameOf = (id: string) => {
    const n = devices.find((x) => x.id === id)
    return n ? nodeName(n.data, n.data.system_id ? records.get(n.data.system_id) : undefined) : '—'
  }
  const gateway = gateways.get(device.id) ?? null
  const chain = useMemo(() => {
    const out: string[] = []
    let cur = gateways.get(device.id)
    while (cur && !out.includes(cur) && out.length < 32) { out.push(cur); cur = gateways.get(cur) }
    return out
  }, [gateways, device.id])
  const below = useMemo(() => descendants(device.id), [descendants, device.id])
  const gatewayOptions = devices.filter((n) => n.id !== device.id && !below.has(n.id))
  const touching = edges.filter((e) => e.source === device.id || e.target === device.id)
  const issues = concerns(record)
  const suggestions = [...new Set([...meta.functions, ...COMMON_FUNCTIONS])].filter((f) => !d.functions.includes(f))
  const [custom, setCustom] = useState('')
  const [promoting, setPromoting] = useState(false)

  const addFunction = (f: string) => {
    const v = f.trim()
    if (!v || d.functions.includes(v)) return
    checkpoint()
    t.update(device.id, { functions: [...d.functions, v] })
  }

  const remote = async (kind: 'desktop' | 'terminal') => {
    try {
      const urls = await getMeshRemoteUrls(record!.id)
      const url = kind === 'desktop' ? urls.desktop : urls.terminal
      if (url) window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('Could not get a remote session from MeshCentral')
    }
  }

  return (
    <div className="nm-panel">
      <header className="nm-panel-head">
        <span className={cn('nm-glyph nm-glyph--lg', `tier-${meta.tier}`)}><Icon /></span>
        <div className="min-w-0">
          <div className="kicker">{meta.label} · {record ? 'system' : 'sketch'}</div>
          <h2 className="nm-panel-title" title={nodeName(d, record)}>{nodeName(d, record)}</h2>
        </div>
      </header>

      <Section title="§ Identity">
        <div className="space-y-3">
          <label className="block">
            <span className="label-micro">Kind</span>
            <select
              className="input-field nm-input"
              value={d.kind}
              onFocus={checkpoint}
              onChange={(e) => t.update(device.id, { kind: e.target.value as NodeKind })}
            >
              {KIND_GROUPS.map((g) => (
                <optgroup key={g.title} label={g.title}>
                  {g.kinds.map((k) => <option key={k} value={k}>{NODE_KINDS[k].label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <Field
            label={record ? 'Label on the map' : 'Name'}
            value={d.label}
            placeholder={record?.name ?? meta.label}
            onFocus={checkpoint}
            onChange={(v) => t.update(device.id, { label: v || null })}
            autoFocus={autoFocusId === device.id && !record}
          />
          <Field
            label="Address"
            value={d.address}
            placeholder={record?.ip_address ?? record?.hostname ?? 'IP, subnet or hostname'}
            mono
            onFocus={checkpoint}
            onChange={(v) => t.update(device.id, { address: v || null })}
          />
        </div>
      </Section>

      <Section title="§ Gateway" aside={below.size > 0 ? <span className="nm-aside">feeds {below.size}</span> : undefined}>
        <select
          className="input-field nm-input"
          value={gateway ?? ''}
          onChange={(e) => { checkpoint(); t.setGateway(device.id, e.target.value || null) }}
        >
          <option value="">None — this is a top of the tree</option>
          {gatewayOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {nodeName(n.data, n.data.system_id ? records.get(n.data.system_id) : undefined)} · {NODE_KINDS[n.data.kind].label}
            </option>
          ))}
        </select>
        {chain.length > 0 && (
          <ol className="nm-chain">
            {chain.map((id) => (
              <li key={id}><ChevronUp className="h-3 w-3" />{nameOf(id)}</li>
            ))}
          </ol>
        )}
        <div className="nm-attach">
          <span className="label-micro">Attach below</span>
          <div className="nm-attach-row">
            {(['switch', 'access_point', 'server', 'workstation', 'printer', 'other'] as NodeKind[]).map((k) => {
              const KIcon = NODE_KINDS[k].icon
              return (
                <button key={k} onClick={() => t.attachChild(device.id, k)} title={`Attach a new ${NODE_KINDS[k].label.toLowerCase()} that uses this as its gateway`}>
                  <KIcon />
                </button>
              )
            })}
          </div>
        </div>
      </Section>

      <Section title="§ System">
        {record ? (
          <div className="space-y-3">
            {record.archived && <p className="nm-warn">This record is archived.</p>}
            <LiveLine live={state} />
            <Facts rows={[
              ['System', record.name],
              ['Type', record.category],
              ['Hostname', record.hostname],
              ['IP', record.ip_address],
              ['MAC', record.mac_address],
              ['OS', [record.operating_system, record.os_version].filter(Boolean).join(' ')],
              ['Make', [record.manufacturer, record.model].filter(Boolean).join(' ')],
              ['Serial', record.serial_number],
            ]} />
            {state.monitors.length > 0 && (
              <ul className="nm-monitors">
                {state.monitors.map((m) => (
                  <li key={m.id} data-state={m.status_label}>
                    <span className="nm-live-pip" />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="tnum">{m.response_time != null ? `${m.response_time} ms` : m.status_label}</span>
                  </li>
                ))}
              </ul>
            )}
            {issues.length > 0 && (
              <ul className="nm-issues">
                {issues.map((i) => <li key={i.text} data-tone={i.tone}>{i.text}</li>)}
              </ul>
            )}
            {record.firewall_rules.length > 0 && (
              <div>
                <span className="label-micro">Firewall rules</span>
                <ul className="nm-rules">
                  {record.firewall_rules.map((r) => (
                    <li key={r.id}>
                      <span className="tnum">{r.direction === 'inbound' ? '⇣' : '⇡'} {r.protocol} {r.external_port}{r.internal_port ? `→${r.internal_port}` : ''}</span>
                      <span className="truncate">{r.name}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/firewall-rules" className="nm-link-out">Firewall register <ExternalLink className="h-3 w-3" /></Link>
              </div>
            )}
            <div className="nm-button-row">
              <Link to={`/systems/${record.id}`} className="btn-base btn-secondary nm-btn">
                <ExternalLink className="h-3 w-3" /> Open system
              </Link>
              {record.mesh_node_id && (
                <>
                  <button className="btn-base btn-secondary nm-btn" onClick={() => remote('desktop')} title="Remote desktop"><Monitor className="h-3 w-3" /></button>
                  <button className="btn-base btn-secondary nm-btn" onClick={() => remote('terminal')} title="Terminal"><Terminal className="h-3 w-3" /></button>
                </>
              )}
              <button className="btn-base btn-ghost nm-btn" onClick={() => { checkpoint(); t.linkRecord(device.id, null) }} title="Keep the device on the map, drop the link to the system">
                <Unlink className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="nm-hint">Drawn on the map only. Link it to a system, or make one from it.</p>
            <select
              className="input-field nm-input"
              value=""
              onChange={(e) => { if (e.target.value) { checkpoint(); t.linkRecord(device.id, e.target.value) } }}
              disabled={unplaced.length === 0}
            >
              <option value="">{unplaced.length ? 'Link to a system…' : 'No unplaced systems'}</option>
              {unplaced.map((r) => <option key={r.id} value={r.id}>{r.name}{r.ip_address ? ` · ${r.ip_address}` : ''}</option>)}
            </select>
            <button
              className="btn-base btn-secondary nm-btn w-full"
              disabled={promoting}
              onClick={async () => { setPromoting(true); try { await t.promote(device.id) } finally { setPromoting(false) } }}
            >
              <Plus className="h-3 w-3" /> {promoting ? 'Creating…' : 'Create a system from this device'}
            </button>
          </div>
        )}
      </Section>

      <Section title="§ Functions">
        <div className="nm-fn">
          {d.functions.map((f) => (
            <button key={f} className="nm-fn-on" onClick={() => { checkpoint(); t.update(device.id, { functions: d.functions.filter((x) => x !== f) }) }} title="Remove">
              {f}<X className="h-2.5 w-2.5" />
            </button>
          ))}
          {suggestions.slice(0, 10).map((f) => (
            <button key={f} className="nm-fn-off" onClick={() => addFunction(f)}>{f}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); addFunction(custom); setCustom('') }} className="mt-2">
          <input className="input-field nm-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Another function, then Enter" maxLength={40} />
        </form>
      </Section>

      <Section title="§ Notes">
        <Field value={d.notes} multiline onFocus={checkpoint} onChange={(v) => t.update(device.id, { notes: v || null })} placeholder="What this does, how to reach it, what to watch for" />
      </Section>

      {touching.length > 0 && (
        <Section title="§ Connections">
          <ul className="nm-conns">
            {touching.map((e) => {
              const other = e.source === device.id ? e.target : e.source
              const isGateway = e.data?.role === 'uplink' && e.source === device.id
              const isChild = e.data?.role === 'uplink' && e.target === device.id
              return (
                <li key={e.id}>
                  <button onClick={() => t.selectEdge(e.id)}>
                    <LineSwatch kind={e.data!.kind} />
                    <span className="truncate flex-1 text-left">{nameOf(other)}</span>
                    <span className="nm-conn-role">{isGateway ? 'gateway' : isChild ? 'feeds' : 'peer'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <div className="nm-panel-foot">
        <button className="btn-base btn-danger nm-btn w-full" onClick={() => t.remove(device.id)}>
          <Trash2 className="h-3 w-3" /> Remove from map
        </button>
        {record && <p className="nm-hint mt-2">The system itself stays in Systems.</p>}
      </div>
    </div>
  )
}

// ── a connection ─────────────────────────────────────────────────────────

function LinkPanel({ link, devices, records, gateways, checkpoint, linkTools: t }: InspectorProps & { link: LinkEdge }) {
  const d = link.data!
  const nameOf = (id: string) => {
    const n = devices.find((x) => x.id === id)
    return n ? nodeName(n.data, n.data.system_id ? records.get(n.data.system_id) : undefined) : '—'
  }
  const a = nameOf(link.source)
  const b = nameOf(link.target)
  const sourceHasOtherGateway = gateways.has(link.source) && d.role !== 'uplink'
  const loops = (from: string, to: string) => {
    let cur: string | undefined = to
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) { if (cur === from) return true; seen.add(cur); cur = gateways.get(cur) }
    return false
  }
  const uplinkWouldLoop = d.role !== 'uplink' && loops(link.source, link.target)

  return (
    <div className="nm-panel">
      <header className="nm-panel-head">
        <span className="nm-glyph nm-glyph--lg"><LineSwatch kind={d.kind} /></span>
        <div className="min-w-0">
          <div className="kicker">Connection · {LINK_KINDS[d.kind].label}</div>
          <h2 className="nm-panel-title nm-panel-title--sm">{a} <span className="text-ink-faint">↔</span> {b}</h2>
        </div>
      </header>

      <Section title="§ Role">
        <div className="nm-seg">
          <button
            className={cn(d.role === 'uplink' && 'is-on')}
            disabled={uplinkWouldLoop}
            onClick={() => { if (d.role !== 'uplink') { checkpoint(); t.setRole(link.id, 'uplink') } }}
            title={uplinkWouldLoop ? `${b} already sits below ${a}` : undefined}
          >
            Gateway
          </button>
          <button className={cn(d.role === 'peer' && 'is-on')} onClick={() => { if (d.role !== 'peer') { checkpoint(); t.setRole(link.id, 'peer') } }}>
            Peer
          </button>
        </div>
        <p className="nm-hint mt-2">
          {d.role === 'uplink'
            ? <><b>{b}</b> is the gateway of <b>{a}</b>.</>
            : sourceHasOtherGateway
              ? <>A plain connection. Making it the gateway replaces {a}’s current one.</>
              : <>A plain connection; neither end is the other’s gateway.</>}
        </p>
        <button className="btn-base btn-ghost nm-btn mt-2" onClick={() => { checkpoint(); t.swap(link.id) }}>
          <ArrowUpDown className="h-3 w-3" /> Swap ends
        </button>
      </Section>

      <Section title="§ Medium">
        <div className="nm-media">
          {LINK_KIND_ORDER.map((k) => (
            <button key={k} className={cn(d.kind === k && 'is-on')} onClick={() => { if (d.kind !== k) { checkpoint(); t.update(link.id, { kind: k }) } }} title={LINK_KINDS[k].hint}>
              <LineSwatch kind={k} />
              <span>{LINK_KINDS[k].label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="§ Ports">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`On ${a}`} value={d.source_port} mono placeholder="eth0" onFocus={checkpoint} onChange={(v) => t.update(link.id, { source_port: v || null })} />
          <Field label={`On ${b}`} value={d.target_port} mono placeholder="Gi0/24" onFocus={checkpoint} onChange={(v) => t.update(link.id, { target_port: v || null })} />
        </div>
      </Section>

      <Section title="§ Carries">
        <div className="space-y-3">
          <div>
            <Field label="Speed" value={d.speed} mono placeholder="1G" onFocus={checkpoint} onChange={(v) => t.update(link.id, { speed: v || null })} />
            <div className="nm-quick">
              {SPEEDS.map((s) => (
                <button key={s} className={cn(d.speed === s && 'is-on')} onClick={() => { checkpoint(); t.update(link.id, { speed: d.speed === s ? null : s }) }}>{s}</button>
              ))}
            </div>
          </div>
          <Field label="VLANs" value={d.vlan} mono placeholder="10, 20, 99" onFocus={checkpoint} onChange={(v) => t.update(link.id, { vlan: v || null })} />
          <Field label="Label" value={d.label} placeholder="Core uplink, LACP, site-to-site…" onFocus={checkpoint} onChange={(v) => t.update(link.id, { label: v || null })} />
          <Field label="Notes" value={d.notes} multiline onFocus={checkpoint} onChange={(v) => t.update(link.id, { notes: v || null })} />
        </div>
      </Section>

      <div className="nm-panel-foot">
        <button className="btn-base btn-danger nm-btn w-full" onClick={() => t.remove(link.id)}>
          <Trash2 className="h-3 w-3" /> Remove connection
        </button>
      </div>
    </div>
  )
}

// ── a zone ───────────────────────────────────────────────────────────────

function ZonePanel({ zone, checkpoint, autoFocusId, zoneTools: t }: InspectorProps & { zone: ZoneNode }) {
  const d = zone.data
  return (
    <div className="nm-panel">
      <header className="nm-panel-head">
        <span className="nm-glyph nm-glyph--lg" style={{ color: ZONE_TONES[d.tone].color }}><SquareDashed /></span>
        <div className="min-w-0">
          <div className="kicker">Zone</div>
          <h2 className="nm-panel-title">{d.label || 'Zone'}</h2>
        </div>
      </header>
      <Section title="§ Zone">
        <div className="space-y-3">
          <Field label="Label" value={d.label} placeholder="DMZ · VLAN 30" onFocus={checkpoint} onChange={(v) => t.update(zone.id, { label: v })} autoFocus={autoFocusId === zone.id} />
          <div>
            <span className="label-micro">Tone</span>
            <div className="nm-tones">
              {ZONE_TONE_ORDER.map((k: ZoneTone) => (
                <button
                  key={k}
                  className={cn(d.tone === k && 'is-on')}
                  style={{ '--tone': ZONE_TONES[k].color } as CSSProperties}
                  onClick={() => { checkpoint(); t.update(zone.id, { tone: k }) }}
                  title={ZONE_TONES[k].label}
                />
              ))}
            </div>
          </div>
          <Field label="Notes" value={d.notes} multiline onFocus={checkpoint} onChange={(v) => t.update(zone.id, { notes: v || null })} placeholder="Subnet, purpose, who may reach it" />
        </div>
      </Section>
      <p className="nm-hint px-5">Drag the zone by its label to carry everything inside it. Corners resize it.</p>
      <div className="nm-panel-foot">
        <button className="btn-base btn-danger nm-btn w-full" onClick={() => t.remove(zone.id)}>
          <Trash2 className="h-3 w-3" /> Remove zone
        </button>
        <p className="nm-hint mt-2">The devices inside stay where they are.</p>
      </div>
    </div>
  )
}

// ── several things ───────────────────────────────────────────────────────

function MultiPanel({ multi, onWrapInZone, onRemoveSelection }: InspectorProps & { multi: NonNullable<InspectorProps['multi']> }) {
  const parts = [
    multi.devices && `${multi.devices} device${multi.devices === 1 ? '' : 's'}`,
    multi.links && `${multi.links} connection${multi.links === 1 ? '' : 's'}`,
    multi.zones && `${multi.zones} zone${multi.zones === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return (
    <div className="nm-panel">
      <header className="nm-panel-head">
        <div className="min-w-0">
          <div className="kicker">Selection</div>
          <h2 className="nm-panel-title">{parts.join(', ')}</h2>
        </div>
      </header>
      <Section title="§ Together">
        <div className="space-y-2">
          {multi.devices > 0 && (
            <button className="btn-base btn-secondary nm-btn w-full" onClick={onWrapInZone}>
              <SquareDashed className="h-3 w-3" /> Draw a zone around them
            </button>
          )}
          <button className="btn-base btn-danger nm-btn w-full" onClick={onRemoveSelection}>
            <Trash2 className="h-3 w-3" /> Remove from map
          </button>
        </div>
      </Section>
    </div>
  )
}

// ── the map itself ───────────────────────────────────────────────────────

function MapPanel({ meta, locations, onMeta, stats, liveConfigured }: InspectorProps) {
  const [name, setName] = useState(meta.name)
  const [description, setDescription] = useState(meta.description ?? '')
  useEffect(() => { setName(meta.name); setDescription(meta.description ?? '') }, [meta.name, meta.description])

  return (
    <div className="nm-panel">
      <header className="nm-panel-head">
        <div className="min-w-0">
          <div className="kicker">{meta.organization_name ?? 'Network map'}</div>
          <h2 className="nm-panel-title">{meta.name}</h2>
        </div>
      </header>

      <Section title="§ At a glance">
        <div className="nm-stats">
          <div><b className="tnum">{stats.devices}</b><span>devices</span></div>
          <div><b className="tnum">{stats.links}</b><span>connections</span></div>
          <div><b className="tnum">{stats.placed}<i>/{stats.records}</i></b><span>systems placed</span></div>
          <div>
            <b className={cn('tnum', stats.down > 0 && 'text-bad')}>{liveConfigured ? `${stats.up}/${stats.down}` : '—'}</b>
            <span>{liveConfigured ? 'up / down' : 'no live feed'}</span>
          </div>
        </div>
      </Section>

      <Section title="§ Map">
        <div className="space-y-3">
          <label className="block">
            <span className="label-micro">Name</span>
            <input
              className="input-field nm-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { const v = name.trim(); if (v && v !== meta.name) onMeta({ name: v }); else setName(meta.name) }}
            />
          </label>
          <label className="block">
            <span className="label-micro">Site</span>
            <select
              className="input-field nm-input"
              value={meta.location_id ?? ''}
              onChange={(e) => onMeta({ location_id: e.target.value || null })}
            >
              <option value="">Whole organisation</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label-micro">Description</span>
            <textarea
              rows={3}
              className="input-field nm-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (meta.description ?? '')) onMeta({ description: description || null }) }}
              placeholder="What this map covers"
            />
          </label>
        </div>
      </Section>

      <Section title="§ Legend">
        <ul className="nm-legend">
          {LINK_KIND_ORDER.map((k) => (
            <li key={k}><LineSwatch kind={k} /><span>{LINK_KINDS[k].label}</span><i>{LINK_KINDS[k].hint}</i></li>
          ))}
        </ul>
        <ul className="nm-legend nm-legend--live">
          {(['up', 'down', 'pending', 'offline'] as const).map((s) => (
            <li key={s} style={{ '--live': LIVE_COLOR[s] } as CSSProperties}><span className="nm-live-pip" /><span>{LIVE_LABEL[s]}</span></li>
          ))}
          <li><span className="nm-legend-plate" /><span>System</span></li>
          <li><span className="nm-legend-plate is-sketch" /><span>Sketch</span></li>
        </ul>
      </Section>

      <Section title="§ Keys">
        <dl className="nm-keys">
          <div><dt>Drag edge → device</dt><dd>connect</dd></div>
          <div><dt>Shift + drag</dt><dd>select an area</dd></div>
          <div><dt>Del</dt><dd>remove selected</dd></div>
          <div><dt>Ctrl Z / Ctrl ⇧ Z</dt><dd>undo / redo</dd></div>
          <div><dt>F</dt><dd>fit the map</dd></div>
          <div><dt>Esc</dt><dd>clear selection</dd></div>
        </dl>
        <p className="nm-hint mt-3"><CornerDownRight className="inline h-3 w-3" /> Select a device to trace its route to the top.</p>
      </Section>
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, Monitor, Network, Terminal, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { getOrganizations } from '@/api/organizations'
import { getMapPlacements } from '@/api/network-maps'
import { getMeshRemoteUrls } from '@/api/meshcentral'
import { dnsLookup } from '@/api/dns'
import { cn } from '@/lib/utils'
import type { DeviceRole, MalwareProtection, System } from '@/types'
import { ceStatus } from './badges'

type SetField = <K extends keyof System>(k: K, v: System[K]) => void

const DEVICE_ROLES: DeviceRole[] = ['employee', 'admin', 'byod', 'server', 'network']
const MALWARE: { value: MalwareProtection; label: string }[] = [
  { value: 'defender', label: 'Windows Defender / built-in' },
  { value: 'allowlist', label: 'Application allow-listing' },
  { value: 'thirdparty', label: 'Third-party AV' },
  { value: 'none', label: 'None' },
]

function Kicker({ children }: { children: ReactNode }) {
  return <div className="kicker mb-3" style={{ color: 'var(--ink-faint)' }}>{children}</div>
}

function Text({
  label, value, onChange, mono, placeholder, type = 'text',
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  mono?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block min-w-0">
      <span className="label-micro">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className={cn('input-field', mono && 'tnum')}
      />
    </label>
  )
}

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'never')

/** Where a system sits, what it is made of, what its agents say and its CE evidence. */
export function SystemFacts({ system, setField }: { system: System; setField: SetField }) {
  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })
  const { data: placements = [] } = useQuery({
    queryKey: ['network-maps', 'placements', system.id],
    queryFn: () => getMapPlacements({ system_id: system.id }),
  })
  const [resolving, setResolving] = useState(false)
  const machine = !!system.organization_id
  const [showInventory, setShowInventory] = useState(
    machine || !!(system.hostname || system.ip_address || system.operating_system),
  )
  const ce = ceStatus(system)

  const resolve = async () => {
    const host = system.hostname?.trim()
    if (!host) return
    setResolving(true)
    try {
      const r = await dnsLookup(host)
      const ip = r.a[0] || r.aaaa[0]
      if (!ip) toast.error('No DNS records found')
      else { setField('ip_address', ip); toast.success(`Resolved to ${ip}`) }
    } catch {
      toast.error('Lookup failed')
    } finally {
      setResolving(false)
    }
  }

  const remote = async (kind: 'desktop' | 'terminal') => {
    try {
      const urls = await getMeshRemoteUrls(system.id)
      const url = kind === 'desktop' ? urls.desktop : urls.terminal
      if (url) window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('Could not get a remote session from MeshCentral')
    }
  }

  return (
    <div className="space-y-6">
      {/* Where it lives */}
      <div>
        <Kicker>§ Where</Kicker>
        <select
          className="input-field"
          value={system.organization_id ?? ''}
          onChange={(e) => setField('organization_id', e.target.value || null)}
        >
          <option value="">Estate-wide: belongs to no client</option>
          {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {placements.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {placements.map((p) => (
              <Link
                key={p.node_id}
                to={`/network-maps/${p.map_id}?focus=${system.id}`}
                className="badge-instrument gap-1.5"
                style={{ color: 'var(--ember)' }}
              >
                <Network className="h-3 w-3" /> {p.map_name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* What its agents say */}
      {(system.mesh_node_id || system.wegweiser_device_id) && (
        <div>
          <Kicker>§ Agents</Kicker>
          <div className="space-y-3">
            {system.mesh_node_id && (
              <div className="surface-sunken px-4 py-3 flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ background: system.mesh_agent_connected ? 'var(--green)' : 'var(--ink-faint)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-ink">MeshCentral · {system.mesh_agent_connected ? 'online' : 'offline'}</div>
                  <div className="text-xxs text-ink-faint">Synced {ago(system.mesh_last_sync_at)}; keeps name, hostname, IP and OS current</div>
                </div>
                <button className="btn-base btn-secondary px-2 py-1" onClick={() => remote('desktop')} title="Remote desktop"><Monitor className="h-3.5 w-3.5" /></button>
                <button className="btn-base btn-secondary px-2 py-1" onClick={() => remote('terminal')} title="Terminal"><Terminal className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {system.wegweiser_device_id && (
              <div className="surface-sunken px-4 py-3 flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ background: system.wegweiser_online ? 'var(--green)' : 'var(--ink-faint)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-ink">
                    Wegweiser · {system.wegweiser_online ? 'online' : 'offline'}
                    {system.wegweiser_extra?.health_score != null && (
                      <span className="text-ink-dim"> · health {Math.round(system.wegweiser_extra.health_score)}</span>
                    )}
                  </div>
                  <div className="text-xxs text-ink-faint truncate">
                    Seen {ago(system.wegweiser_last_seen_at)} · pushed {ago(system.wegweiser_synced_at)}
                    {system.wegweiser_extra?.group && ` · ${system.wegweiser_extra.group}`}
                    {system.wegweiser_extra?.agent_version && ` · agent ${system.wegweiser_extra.agent_version}`}
                  </div>
                </div>
                {system.wegweiser_extra?.url && (
                  <a className="btn-base btn-secondary px-2 py-1" href={system.wegweiser_extra.url} target="_blank" rel="noopener noreferrer" title="Open in Wegweiser">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* What it is made of */}
      <div>
        <div className="flex items-center justify-between">
          <Kicker>§ Inventory</Kicker>
          {!machine && (
            <button className="text-xxs font-mono uppercase tracking-button text-ink-faint hover:text-ember mb-3" onClick={() => setShowInventory((v) => !v)}>
              {showInventory ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        {showInventory && (
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Text label="Hostname" value={system.hostname} mono onChange={(v) => setField('hostname', v)} />
              {system.hostname && (
                <button
                  type="button"
                  onClick={resolve}
                  disabled={resolving}
                  className="absolute right-2 top-[27px] p-1 hover:bg-[var(--ember-wash)]"
                  title="Resolve the hostname to an IP"
                >
                  {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--ember)' }} /> : <Wand2 className="h-3.5 w-3.5" style={{ color: 'var(--ember)' }} />}
                </button>
              )}
            </div>
            <Text label="IP address" value={system.ip_address} mono onChange={(v) => setField('ip_address', v)} />
            <Text label="MAC address" value={system.mac_address} mono onChange={(v) => setField('mac_address', v)} />
            <Text label="Serial number" value={system.serial_number} mono onChange={(v) => setField('serial_number', v)} />
            <Text label="Operating system" value={system.operating_system} onChange={(v) => setField('operating_system', v)} />
            <Text label="OS version" value={system.os_version} mono onChange={(v) => setField('os_version', v)} />
            <Text label="Manufacturer" value={system.manufacturer} onChange={(v) => setField('manufacturer', v)} />
            <Text label="Model" value={system.model} onChange={(v) => setField('model', v)} />
            <Text label="Warranty expires" type="date" value={system.warranty_expiration?.slice(0, 10) ?? null} onChange={(v) => setField('warranty_expiration', v)} />
          </div>
        )}
      </div>

      {/* Cyber Essentials evidence */}
      {machine && (
        <div>
          <Kicker>§ Cyber Essentials</Kicker>
          {system.ce_in_scope && ce.tone !== 'unknown' && (
            <ul className="mb-3 space-y-1">
              {ce.reasons.map((r) => (
                <li key={r} className={cn('text-xs pl-3 border-l-2', ce.tone === 'ok' ? 'border-ok text-ok' : ce.tone === 'bad' ? 'border-bad text-bad' : 'border-warn text-warn')}>{r}</li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 text-xs mb-3">
            <input type="checkbox" checked={system.ce_in_scope} onChange={(e) => setField('ce_in_scope', e.target.checked)} />
            In Cyber Essentials scope
          </label>
          {system.ce_in_scope && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-micro">Device role</span>
                <select className="input-field" value={system.device_role ?? ''} onChange={(e) => setField('device_role', (e.target.value || null) as DeviceRole | null)}>
                  <option value="">— Not set —</option>
                  {DEVICE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Software firewall</span>
                <select
                  className="input-field"
                  value={system.software_firewall_on === null ? '' : system.software_firewall_on ? 'yes' : 'no'}
                  onChange={(e) => setField('software_firewall_on', e.target.value === '' ? null : e.target.value === 'yes')}
                >
                  <option value="">Unknown</option>
                  <option value="yes">On</option>
                  <option value="no">Off</option>
                </select>
              </label>
              <label className="block">
                <span className="label-micro">Malware protection</span>
                <select className="input-field" value={system.malware_protection ?? ''} onChange={(e) => setField('malware_protection', (e.target.value || null) as MalwareProtection | null)}>
                  <option value="">— Not set —</option>
                  {MALWARE.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <Text label="OS end of life" type="date" value={system.os_eol_date?.slice(0, 10) ?? null} onChange={(v) => setField('os_eol_date', v)} />
              <Text label="Last patched" type="date" value={system.last_patched_date?.slice(0, 10) ?? null} onChange={(v) => setField('last_patched_date', v)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

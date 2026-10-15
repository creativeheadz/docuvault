import type { MapRecord, UptimeMonitor } from '@/types'

/**
 * What the map knows about a device right now. Uptime Kuma speaks for a
 * device when one of its monitors points at it; failing that the
 * MeshCentral agent does, then the Wegweiser agent; failing all three the
 * map says nothing.
 */
export type LiveState = 'up' | 'down' | 'pending' | 'maintenance' | 'online' | 'offline' | 'unknown'

export interface Live {
  state: LiveState
  source: 'kuma' | 'mesh' | 'wegweiser' | null
  monitors: UptimeMonitor[]
  summary: string
}

export const UNKNOWN: Live = { state: 'unknown', source: null, monitors: [], summary: 'No live signal' }

/** Colour token for each state. */
export const LIVE_COLOR: Record<LiveState, string> = {
  up: 'var(--green)',
  online: 'var(--green)',
  down: 'var(--red)',
  pending: 'var(--warn)',
  maintenance: 'var(--blue)',
  offline: 'var(--ink-faint)',
  unknown: 'var(--line-hot)',
}

export const LIVE_LABEL: Record<LiveState, string> = {
  up: 'Up',
  online: 'Agent online',
  down: 'Down',
  pending: 'Pending',
  maintenance: 'Maintenance',
  offline: 'Agent offline',
  unknown: 'No signal',
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url.includes('://') ? url : `http://${url}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Indexes monitors by every name a device might be known by. */
export function indexMonitors(monitors: UptimeMonitor[]): Map<string, UptimeMonitor[]> {
  const index = new Map<string, UptimeMonitor[]>()
  const add = (key: string | null | undefined, m: UptimeMonitor) => {
    const k = key?.trim().toLowerCase()
    if (!k) return
    const list = index.get(k) ?? []
    if (!list.includes(m)) list.push(m)
    index.set(k, list)
  }
  for (const m of monitors) {
    add(m.hostname, m)
    add(hostOf(m.url), m)
    add(`name:${m.name}`, m)
  }
  return index
}

export function liveFor(
  record: MapRecord | undefined,
  address: string | null,
  label: string | null,
  monitors: Map<string, UptimeMonitor[]>,
): Live {
  const keys = [
    record?.hostname, record?.ip_address, address?.split('/')[0],
    record ? `name:${record.name}` : null, label ? `name:${label}` : null,
  ]
  const found: UptimeMonitor[] = []
  for (const k of keys) {
    for (const m of monitors.get(k?.trim().toLowerCase() ?? '') ?? []) if (!found.includes(m)) found.push(m)
  }

  if (found.length) {
    const labels = found.map((m) => m.status_label)
    const state: LiveState = labels.includes('down') ? 'down'
      : labels.includes('pending') ? 'pending'
      : labels.every((l) => l === 'maintenance') ? 'maintenance'
      : 'up'
    const down = found.filter((m) => m.status_label === 'down').length
    const summary = state === 'down'
      ? `${down} of ${found.length} monitor${found.length === 1 ? '' : 's'} down`
      : `${found.length} monitor${found.length === 1 ? '' : 's'} · ${LIVE_LABEL[state].toLowerCase()}`
    return { state, source: 'kuma', monitors: found, summary }
  }

  if (record?.mesh_node_id && record.mesh_agent_connected !== null) {
    const state: LiveState = record.mesh_agent_connected ? 'online' : 'offline'
    return { state, source: 'mesh', monitors: [], summary: LIVE_LABEL[state] }
  }
  if (record?.wegweiser_device_id && record.wegweiser_online !== null) {
    const state: LiveState = record.wegweiser_online ? 'online' : 'offline'
    return { state, source: 'wegweiser', monitors: [], summary: LIVE_LABEL[state] }
  }
  return UNKNOWN
}

export interface Concern {
  tone: 'bad' | 'warn'
  text: string
}

/** The Cyber Essentials facts on a record worth flagging on the map. */
export function concerns(r: MapRecord | undefined): Concern[] {
  if (!r || !r.ce_in_scope) return []
  const out: Concern[] = []
  const today = new Date().toISOString().slice(0, 10)
  if (r.os_eol_date && r.os_eol_date <= today) out.push({ tone: 'bad', text: 'OS past end of life' })
  if (r.software_firewall_on === false) out.push({ tone: 'bad', text: 'Software firewall off' })
  if (r.malware_protection === 'none') out.push({ tone: 'bad', text: 'No malware protection' })
  if (r.last_patched_date) {
    const days = Math.floor((Date.now() - new Date(r.last_patched_date).getTime()) / 86_400_000)
    if (days > 30) out.push({ tone: 'warn', text: `Last patched ${days} days ago` })
  }
  if (r.os_eol_date && r.os_eol_date > today) {
    const days = Math.floor((new Date(r.os_eol_date).getTime() - Date.now()) / 86_400_000)
    if (days <= 180) out.push({ tone: 'warn', text: `OS end of life in ${days} days` })
  }
  return out
}

import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { System } from '@/types'

export type CeTone = 'ok' | 'warn' | 'bad' | 'unknown'

/** Cyber Essentials readiness for one system, and why. */
export function ceStatus(s: System): { tone: CeTone; reasons: string[] } {
  if (!s.organization_id) return { tone: 'unknown', reasons: ['Estate-wide, not a client machine'] }
  if (!s.ce_in_scope) return { tone: 'unknown', reasons: ['Out of scope'] }
  const today = new Date().toISOString().slice(0, 10)
  const reasons: string[] = []
  let bad = false
  if (s.os_eol_date && s.os_eol_date <= today) { reasons.push('OS past end of life'); bad = true }
  if (s.software_firewall_on === false) { reasons.push('Software firewall off'); bad = true }
  if (s.malware_protection === 'none') { reasons.push('No malware protection'); bad = true }

  let warn = false
  if (s.software_firewall_on === null) { reasons.push('Firewall state unknown'); warn = true }
  if (s.malware_protection === null) { reasons.push('Malware protection unrecorded'); warn = true }
  if (s.last_patched_date) {
    const days = Math.floor((Date.now() - new Date(s.last_patched_date).getTime()) / 86_400_000)
    if (days > 30) { reasons.push(`Last patched ${days} days ago`); warn = true }
  } else {
    reasons.push('No patch date recorded')
    warn = true
  }
  if (s.os_eol_date && s.os_eol_date > today) {
    const days = Math.floor((new Date(s.os_eol_date).getTime() - Date.now()) / 86_400_000)
    if (days <= 180) { reasons.push(`OS end of life in ${days} days`); warn = true }
  }

  if (bad) return { tone: 'bad', reasons }
  if (warn) return { tone: 'warn', reasons }
  return { tone: 'ok', reasons: ['All Cyber Essentials checks pass'] }
}

export function CEBadge({ system }: { system: System }) {
  const { tone, reasons } = ceStatus(system)
  const title = reasons.join(' · ')
  if (tone === 'unknown') return <span className="text-xxs text-ink-faint" title={title}>—</span>
  const [Icon, label, cls] = {
    ok: [ShieldCheck, 'ok', 'text-ok'],
    warn: [ShieldAlert, 'check', 'text-warn'],
    bad: [ShieldOff, 'fix', 'text-bad'],
  }[tone] as [typeof ShieldCheck, string, string]
  return (
    <span title={title} className={cn('badge-instrument gap-1', cls)}>
      <Icon className="h-3 w-3" />{label}
    </span>
  )
}

/** Where a system's live state comes from, one mark per agent. */
export function AgentBadges({ system }: { system: System }) {
  const marks: { label: string; on: boolean | null; title: string }[] = []
  if (system.mesh_node_id) {
    marks.push({
      label: 'Mesh',
      on: system.mesh_agent_connected,
      title: `MeshCentral agent ${system.mesh_agent_connected ? 'online' : 'offline'}`,
    })
  }
  if (system.wegweiser_device_id) {
    const health = system.wegweiser_extra?.health_score
    marks.push({
      label: health != null ? `Wegweiser ${Math.round(health)}` : 'Wegweiser',
      on: system.wegweiser_online,
      title: `Wegweiser agent ${system.wegweiser_online ? 'online' : 'offline'}${health != null ? ` · health ${Math.round(health)}` : ''}`,
    })
  }
  if (!marks.length) return <span className="text-xxs text-ink-faint">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {marks.map((m) => (
        <span key={m.label} title={m.title} className="inline-flex items-center gap-1.5 text-xxs font-mono uppercase tracking-button text-ink-dim">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.on ? 'var(--green)' : 'var(--ink-faint)' }} />
          {m.label}
        </span>
      ))}
    </span>
  )
}

export function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneColor = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <div className="surface px-4 py-3">
      <div className="text-xxs font-mono uppercase tracking-kicker text-ink-faint">{label}</div>
      <div className={cn('text-2xl font-serif italic mt-1 flex items-center gap-2 tnum', toneColor)}>
        {value}{tone === 'bad' && <AlertTriangle className="h-3.5 w-3.5" />}
      </div>
    </div>
  )
}

/** Every source a system can come from, as people say it. */
export const SOURCES: Record<string, { label: string; long: string; color: string }> = {
  manual: { label: 'Manual', long: 'Created by a person', color: 'var(--ink-dim)' },
  meshcentral: { label: 'MeshCentral', long: 'MeshCentral', color: 'var(--blue)' },
  wegweiser: { label: 'Wegweiser', long: 'Wegweiser', color: 'var(--ember)' },
  map: { label: 'Map', long: 'Drawn on a network map', color: 'var(--green)' },
  csv: { label: 'CSV', long: 'Imported from a CSV file', color: 'var(--warn)' },
}

export const sourceMeta = (key: string) =>
  SOURCES[key] ?? { label: key, long: key, color: 'var(--ink-dim)' }

/** Where a system came from, then whatever syncs it now, in that order. */
export function sourcesOf(s: System): { key: string; origin: boolean }[] {
  const origin = s.source || 'manual'
  const out = [{ key: origin, origin: true }]
  if (s.mesh_node_id && origin !== 'meshcentral') out.push({ key: 'meshcentral', origin: false })
  if (s.wegweiser_device_id && origin !== 'wegweiser') out.push({ key: 'wegweiser', origin: false })
  return out
}

/**
 * The source marks. The filled one is where the record came from; an
 * outlined one is a sync that has linked it since.
 */
export function SourceBadges({ system }: { system: System }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {sourcesOf(system).map(({ key, origin }) => {
        const m = sourceMeta(key)
        return (
          <span
            key={key}
            className="badge-instrument"
            style={{
              color: m.color,
              background: origin ? `color-mix(in srgb, ${m.color} 14%, transparent)` : 'transparent',
              borderStyle: origin ? 'solid' : 'dashed',
            }}
            title={origin ? `Came from: ${m.long}` : `Also synced by ${m.long}`}
          >
            {m.label}
          </span>
        )
      })}
    </span>
  )
}

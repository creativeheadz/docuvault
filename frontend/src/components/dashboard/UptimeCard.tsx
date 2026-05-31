import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Activity, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react'
import { getUptimeMonitors } from '@/api/uptime'
import type { UptimeMonitor } from '@/types'

const STATUS: Record<string, { dot: string; label: string }> = {
  up: { dot: 'bg-emerald-500', label: 'UP' },
  down: { dot: 'bg-ember', label: 'DOWN' },
  pending: { dot: 'bg-amber-500', label: 'PENDING' },
  maintenance: { dot: 'bg-sky-500', label: 'MAINT' },
  unknown: { dot: 'bg-ink-faint', label: '—' },
}

function pingCls(ms: number | null): string {
  if (ms === null) return 'text-ink-faint'
  if (ms >= 1000) return 'text-ember'
  if (ms >= 400) return 'text-amber-500'
  return 'text-ink-dim'
}

function certCls(days: number | null): string {
  if (days === null) return 'text-ink-faint'
  if (days <= 14) return 'text-ember'
  if (days <= 30) return 'text-amber-500'
  return 'text-ink-faint'
}

function host(m: UptimeMonitor): string {
  if (m.url) return m.url.replace(/^https?:\/\//, '')
  if (m.hostname) return m.port ? `${m.hostname}:${m.port}` : m.hostname
  return m.type ?? ''
}

export default function UptimeCard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['uptime-monitors'],
    queryFn: () => getUptimeMonitors(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  // Stay hidden until Uptime Kuma is wired up in Settings.
  if (!isLoading && !isError && !data?.configured) return null

  const monitors = data?.monitors ?? []
  const summary = data?.summary
  const down = summary?.down ?? 0

  return (
    <section className="surface mb-10">
      <div className="px-6 pt-5 pb-3 border-b border-line flex items-baseline justify-between">
        <div>
          <span className="kicker text-ink-faint">
            Uptime Kuma · {summary ? `${summary.up}/${summary.total} up` : '—'}
            {down > 0 && <span className="text-ember"> · {down} down</span>}
          </span>
          <h2
            className="mt-1 font-serif italic text-xl text-ink m-0"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 420' }}
          >
            Service status
          </h2>
        </div>
        <button
          onClick={() => refetch()}
          className="font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember transition-colors flex items-center gap-1.5"
          title="Refresh from Uptime Kuma"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {data?.error && (
        <div className="px-6 py-2 border-b border-line/60 flex items-center gap-2 font-mono text-xxs text-ember">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="text-ink-dim normal-case">{data.error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ink-dim">
          Reaching Uptime Kuma…
        </div>
      ) : isError ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ember">
          Could not load monitors.
        </div>
      ) : monitors.length === 0 ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ink-dim">
          {data?.error ? 'No monitors returned.' : 'No monitors being tracked.'}
        </div>
      ) : (
        <ul>
          {monitors.map((m, i) => {
            const st = STATUS[m.status_label] ?? STATUS.unknown
            return (
              <li
                key={m.id}
                className={i === monitors.length - 1 ? '' : 'border-b border-line/60'}
              >
                <div className="group flex items-center gap-4 px-6 py-3 border-l-[3px] border-transparent hover:border-ember hover:bg-surface-sunken transition-colors">
                  <span className="w-8 flex justify-center" title={st.label}>
                    <span className={`h-2 w-2 rounded-full ${st.dot} ${m.status_label === 'down' ? 'animate-pulse' : ''}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-ink truncate">{m.name}</div>
                    <div className="font-mono text-xxs text-ink-faint truncate mt-0.5">
                      {host(m)}
                    </div>
                  </div>
                  {m.cert_is_valid === false ? (
                    <span className="font-mono text-xxs uppercase tracking-kicker text-ember shrink-0 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> cert
                    </span>
                  ) : m.cert_days_remaining !== null ? (
                    <span
                      className={`font-mono text-xxs uppercase tracking-kicker shrink-0 ${certCls(m.cert_days_remaining)}`}
                      title="TLS certificate expiry"
                    >
                      cert {m.cert_days_remaining}d
                    </span>
                  ) : null}
                  <span
                    className={`font-mono text-xxs uppercase tracking-kicker shrink-0 w-20 text-right ${pingCls(m.response_time)}`}
                  >
                    {m.response_time !== null ? `${m.response_time}ms` : '—'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="px-6 py-2.5 border-t border-line flex items-center justify-between">
        <span className="font-mono text-xxs text-ink-faint">
          {monitors.length ? `${monitors.length} monitors` : ''}
        </span>
        <Link
          to="/settings"
          className="font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember transition-colors"
        >
          Manage uptime →
        </Link>
      </div>
    </section>
  )
}

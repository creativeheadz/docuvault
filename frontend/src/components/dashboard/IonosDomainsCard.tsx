import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Globe, RefreshCw } from 'lucide-react'
import { getIonosDomains } from '@/api/ionos'
import type { IonosDomain } from '@/types'

/** Urgency band for an expiry countdown — drives the accent colour. */
function urgency(days: number | null): { cls: string; label: string } {
  if (days === null) return { cls: 'text-ink-faint', label: '—' }
  if (days < 0) return { cls: 'text-ember', label: `expired ${-days}d ago` }
  if (days <= 30) return { cls: 'text-ember', label: `${days}d left` }
  if (days <= 90) return { cls: 'text-amber-500', label: `${days}d left` }
  return { cls: 'text-ink-dim', label: `${days}d left` }
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? 'unknown'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function IonosDomainsCard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['ionos-domains'],
    queryFn: () => getIonosDomains(),
    staleTime: 5 * 60 * 1000,
  })

  // Hide the card entirely until IONOS is wired up in Settings.
  if (!isLoading && !isError && data && !data.configured) return null

  const domains: IonosDomain[] = data?.domains ?? []

  return (
    <section className="surface mb-10">
      <div className="px-6 pt-5 pb-3 border-b border-line flex items-baseline justify-between">
        <div>
          <span className="kicker text-ink-faint">IONOS · live</span>
          <h2
            className="mt-1 font-serif italic text-xl text-ink m-0"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 420' }}
          >
            Domain expiry
          </h2>
        </div>
        <button
          onClick={() => refetch()}
          className="font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember transition-colors flex items-center gap-1.5"
          title="Refresh from IONOS"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ink-dim">
          Reaching IONOS…
        </div>
      ) : isError || data?.error ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ember">
          {data?.error || 'Could not reach the IONOS API.'}
        </div>
      ) : domains.length === 0 ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ink-dim">
          No domains on the IONOS account.
        </div>
      ) : (
        <ul>
          {domains.map((d, i) => {
            const u = urgency(d.days_until_expiry)
            return (
              <li
                key={d.id ?? d.name ?? i}
                className={i === domains.length - 1 ? '' : 'border-b border-line/60'}
              >
                <div className="group flex items-center gap-4 px-6 py-3 border-l-[3px] border-transparent hover:border-ember hover:bg-surface-sunken transition-colors">
                  <span className="font-mono text-[10px] uppercase tracking-kicker text-ink-faint w-8 tnum-mono">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Globe className="h-3.5 w-3.5 text-ink-faint group-hover:text-ember transition-colors shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-ink truncate">{d.name}</div>
                    <div className="font-mono text-xxs text-ink-faint truncate mt-0.5">
                      {fmtDate(d.expiration_date)}
                      {d.auto_renew ? ' · auto-renew on' : ' · auto-renew off'}
                    </div>
                  </div>
                  <span className={`font-mono text-xxs uppercase tracking-kicker shrink-0 ${u.cls}`}>
                    {u.label}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="px-6 py-2.5 border-t border-line flex items-center justify-between">
        <span className="font-mono text-xxs text-ink-faint">
          {domains.length ? `${domains.length} domains` : ''}
        </span>
        <Link
          to="/settings"
          className="font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember transition-colors"
        >
          Manage key →
        </Link>
      </div>
    </section>
  )
}

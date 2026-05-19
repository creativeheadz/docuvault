import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Globe, RefreshCw, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react'
import { getRegistrarDomains } from '@/api/registrars'
import type { RegistrarDomain } from '@/types'
import DnsPanel from './DnsPanel'

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

export default function RegistrarDomainsCard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['registrar-domains'],
    queryFn: () => getRegistrarDomains(),
    staleTime: 5 * 60 * 1000,
  })

  const [expanded, setExpanded] = useState<string | null>(null)
  const configured = data?.configured ?? []
  const errors = data?.errors ?? {}
  const domains: RegistrarDomain[] = data?.domains ?? []

  // Stay hidden until at least one registrar is wired up in Settings.
  if (!isLoading && !isError && configured.length === 0) return null

  return (
    <section className="surface mb-10">
      <div className="px-6 pt-5 pb-3 border-b border-line flex items-baseline justify-between">
        <div>
          <span className="kicker text-ink-faint">
            Registrars · {configured.length || '—'} connected
          </span>
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
          title="Refresh from registrars"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {Object.entries(errors).map(([prov, msg]) => (
        <div
          key={prov}
          className="px-6 py-2 border-b border-line/60 flex items-center gap-2 font-mono text-xxs text-ember"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="uppercase tracking-kicker">{prov}</span>
          <span className="text-ink-dim normal-case">— {msg}</span>
        </div>
      ))}

      {isLoading ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ink-dim">
          Reaching registrars…
        </div>
      ) : isError ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ember">
          Could not load registrar domains.
        </div>
      ) : domains.length === 0 ? (
        <div className="py-10 px-6 text-center font-mono text-xs text-ink-dim">
          {Object.keys(errors).length
            ? 'No domains returned.'
            : 'No domains on the connected accounts.'}
        </div>
      ) : (
        <ul>
          {domains.map((d, i) => {
            const u = urgency(d.days_until_expiry)
            const rowKey = `${d.provider}:${d.name}`
            const isOpen = expanded === rowKey
            const canDns = d.supports_dns
            return (
              <li
                key={`${rowKey}:${i}`}
                className={i === domains.length - 1 && !isOpen ? '' : 'border-b border-line/60'}
              >
                <div
                  role={canDns ? 'button' : undefined}
                  tabIndex={canDns ? 0 : undefined}
                  onClick={canDns ? () => setExpanded(isOpen ? null : rowKey) : undefined}
                  onKeyDown={
                    canDns
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpanded(isOpen ? null : rowKey)
                          }
                        }
                      : undefined
                  }
                  className={`group flex items-center gap-4 px-6 py-3 border-l-[3px] border-transparent transition-colors ${
                    canDns
                      ? 'cursor-pointer hover:border-ember hover:bg-surface-sunken'
                      : ''
                  } ${isOpen ? 'border-ember bg-surface-sunken' : ''}`}
                >
                  <span className="w-8 flex justify-center">
                    {canDns ? (
                      isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-ember" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-ink-faint group-hover:text-ember transition-colors" />
                      )
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-kicker text-ink-faint tnum-mono">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    )}
                  </span>
                  <Globe className="h-3.5 w-3.5 text-ink-faint group-hover:text-ember transition-colors shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-ink truncate">
                      {d.name}
                      {canDns && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-kicker text-ink-faint">
                          {isOpen ? 'DNS ▾' : 'DNS ▸'}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xxs text-ink-faint truncate mt-0.5">
                      {fmtDate(d.expiration_date)}
                      {d.auto_renew === true
                        ? ' · auto-renew on'
                        : d.auto_renew === false
                          ? ' · auto-renew off'
                          : ''}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-kicker text-ink-faint shrink-0">
                    {d.provider_label}
                  </span>
                  <span
                    className={`font-mono text-xxs uppercase tracking-kicker shrink-0 w-24 text-right ${u.cls}`}
                  >
                    {u.label}
                  </span>
                </div>
                {isOpen && canDns && (
                  <DnsPanel provider={d.provider} domain={d.name} />
                )}
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
          Manage registrars →
        </Link>
      </div>
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { getOrganizations } from '@/api/organizations'
import { Building2, Server, KeyRound, FileText, Globe, ShieldCheck, Users, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

const quickLinks = [
  { label: 'Organizations',  icon: Building2,    path: '/organizations'    },
  { label: 'Configurations', icon: Server,       path: '/configurations'   },
  { label: 'Passwords',      icon: KeyRound,     path: '/passwords'        },
  { label: 'Documents',      icon: FileText,     path: '/documents'        },
  { label: 'Domains',        icon: Globe,        path: '/domains'          },
  { label: 'SSL Certs',      icon: ShieldCheck,  path: '/ssl-certificates' },
  { label: 'Contacts',       icon: Users,        path: '/contacts'         },
  { label: 'Locations',      icon: MapPin,       path: '/locations'        },
]

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 5 }),
  })

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div>
      {/* Heading */}
      <div className="mb-10">
        <div className="flex items-baseline gap-4">
          <span className="kicker text-ember-deep">§ Overview</span>
          <span className="font-mono text-xxs uppercase tracking-kicker text-ink-faint tnum-mono">
            {today}
          </span>
          <span className="h-px flex-1 bg-line-hot self-center" />
        </div>
        <h1
          className="mt-3 font-serif italic text-4xl text-ink m-0"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380' }}
        >
          Welcome back, {user?.full_name?.split(' ')[0] || user?.username}.
        </h1>
        <p className="mt-2 font-mono text-xs text-ink-dim">
          The vault is open. Eight registers stand ready below.
        </p>
      </div>

      {/* Quick-link grid — instrument tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-10">
        {quickLinks.map((item, idx) => (
          <Link
            key={item.path}
            to={item.path}
            className="group relative bg-surface-raised hover:bg-surface-sunken transition-colors px-5 py-6 flex flex-col justify-between min-h-[120px]"
          >
            <div className="flex items-start justify-between">
              <span className="kicker text-ink-faint group-hover:text-ember transition-colors">
                {item.label}
              </span>
              <item.icon className="h-3.5 w-3.5 text-ink-faint group-hover:text-ember transition-colors" />
            </div>
            <div className="flex items-end justify-between">
              <span
                className="font-serif italic text-3xl text-ember leading-none"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380' }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="font-mono text-xxs uppercase tracking-kicker text-ink-faint group-hover:text-ember transition-colors">
                Open →
              </span>
            </div>
            {/* subtle ember hairline that draws on hover */}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-ember scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
          </Link>
        ))}
      </div>

      {/* Recent organizations */}
      <section className="surface">
        <div className="px-6 pt-5 pb-3 border-b border-line flex items-baseline justify-between">
          <div>
            <span className="kicker text-ink-faint">Latest entries</span>
            <h2
              className="mt-1 font-serif italic text-xl text-ink m-0"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 420' }}
            >
              Recent organizations
            </h2>
          </div>
          <Link
            to="/organizations"
            className="font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember transition-colors"
          >
            All →
          </Link>
        </div>
        {orgs?.items.length ? (
          <ul>
            {orgs.items.map((org, i) => (
              <li
                key={org.id}
                className={i === orgs.items.length - 1 ? '' : 'border-b border-line/60'}
              >
                <Link
                  to={`/organizations/${org.id}`}
                  className="group flex items-center gap-4 px-6 py-3.5 border-l-[3px] border-transparent hover:border-ember hover:bg-surface-sunken transition-colors"
                >
                  <span className="font-mono text-[10px] uppercase tracking-kicker text-ink-faint w-8 tnum-mono">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Building2 className="h-3.5 w-3.5 text-ink-faint group-hover:text-ember transition-colors shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-ink truncate">{org.name}</div>
                    {org.description && (
                      <div className="font-mono text-xxs text-ink-faint truncate mt-0.5">
                        {org.description}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-xxs uppercase tracking-kicker text-ink-faint group-hover:text-ember transition-colors shrink-0">
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-10 px-6 text-center">
            <p className="font-mono text-xs text-ink-dim mb-4">
              No organizations on the record yet.
            </p>
            <Link
              to="/organizations"
              className="btn-base btn-primary text-xxs"
            >
              Create the first one
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}

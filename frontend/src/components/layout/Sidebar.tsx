import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import {
  LayoutDashboard, Building2, MapPin, Users, Server, KeyRound,
  Globe, ShieldCheck, FileText, Puzzle, CheckSquare, BookOpen,
  Search, Settings, ChevronLeft, ChevronRight, BarChart3, Flag,
} from 'lucide-react'

const navItems = [
  { path: '/dashboard',         label: 'Overview',       icon: LayoutDashboard },
  { path: '/organizations',     label: 'Organizations',  icon: Building2 },
  { path: '/locations',         label: 'Locations',      icon: MapPin },
  { path: '/contacts',          label: 'Contacts',       icon: Users },
  { path: '/configurations',    label: 'Configurations', icon: Server },
  { path: '/passwords',         label: 'Passwords',      icon: KeyRound },
  { path: '/domains',           label: 'Domains',        icon: Globe },
  { path: '/ssl-certificates',  label: 'SSL Certs',      icon: ShieldCheck },
  { path: '/documents',         label: 'Documents',      icon: FileText },
  { path: '/flexible-assets',   label: 'Assets',         icon: Puzzle },
  { path: '/checklists',        label: 'Checklists',     icon: CheckSquare },
  { path: '/runbooks',          label: 'Runbooks',       icon: BookOpen },
  { path: '/reports',           label: 'Reports',        icon: BarChart3 },
  { path: '/flags',             label: 'Flags',          icon: Flag },
]

const bottomItems = [
  { path: '/search',   label: 'Search',   icon: Search },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const { collapsed, toggle } = useSidebarStore()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-surface-raised text-ink flex flex-col transition-all duration-200 z-30',
        'border-r border-line',
        collapsed ? 'w-[64px]' : 'w-[240px]'
      )}
    >
      {/* Brand mark */}
      <div className="flex items-center h-[68px] px-4 border-b border-line">
        {!collapsed ? (
          <div className="flex items-baseline gap-2">
            <span
              className="font-serif italic text-[22px] text-ember leading-none"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100, "wght" 400' }}
            >
              DocuVault.
            </span>
          </div>
        ) : (
          <span
            className="font-serif italic text-2xl text-ember leading-none mx-auto"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100, "wght" 400' }}
          >
            D.
          </span>
        )}
        <button
          onClick={toggle}
          className={cn(
            'p-1.5 text-ink-faint hover:text-ember transition-colors',
            collapsed ? 'mx-auto mt-1' : 'ml-auto'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Section kicker (only when expanded) */}
      {!collapsed && (
        <div className="px-5 pt-5 pb-2">
          <span className="kicker text-ink-faint">§ Workspace</span>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-1">
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn('nav-item', active && 'nav-item-active', collapsed && 'justify-center px-0')}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="px-5 pt-3 pb-2">
          <span className="kicker text-ink-faint">§ Tools</span>
        </div>
      )}

      <div className="border-t border-line py-1">
        {bottomItems.map((item) => {
          const active = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn('nav-item', active && 'nav-item-active', collapsed && 'justify-center px-0')}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </div>

      {!collapsed && (
        <div className="px-5 py-3 border-t border-line">
          <div className="font-mono text-[9px] uppercase tracking-kicker text-ink-faint">
            Old Forge Technologies
          </div>
        </div>
      )}
    </aside>
  )
}

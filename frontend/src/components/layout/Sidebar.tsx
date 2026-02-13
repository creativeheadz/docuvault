import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import {
  LayoutDashboard, Building2, MapPin, Users, Server, KeyRound,
  Globe, ShieldCheck, FileText, Puzzle, CheckSquare, BookOpen,
  Search, Settings, ChevronLeft, ChevronRight, BarChart3, Flag,
} from 'lucide-react'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/organizations', label: 'Organizations', icon: Building2 },
  { path: '/locations', label: 'Locations', icon: MapPin },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/configurations', label: 'Configurations', icon: Server },
  { path: '/passwords', label: 'Passwords', icon: KeyRound },
  { path: '/domains', label: 'Domains', icon: Globe },
  { path: '/ssl-certificates', label: 'SSL Certificates', icon: ShieldCheck },
  { path: '/documents', label: 'Documents', icon: FileText },
  { path: '/flexible-assets', label: 'Flexible Assets', icon: Puzzle },
  { path: '/checklists', label: 'Checklists', icon: CheckSquare },
  { path: '/runbooks', label: 'Runbooks', icon: BookOpen },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/flags', label: 'Flags', icon: Flag },
]

const bottomItems = [
  { path: '/search', label: 'Search', icon: Search },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const { collapsed, toggle } = useSidebarStore()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-slate-900 text-white flex flex-col transition-all duration-200 z-30',
        collapsed ? 'w-[64px]' : 'w-[256px]'
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        {!collapsed && <h1 className="text-lg font-bold tracking-tight">DocuVault</h1>}
        <button
          onClick={toggle}
          className={cn('p-1.5 rounded-lg hover:bg-white/10 transition-colors', collapsed ? 'mx-auto' : 'ml-auto')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5',
                active
                  ? 'bg-white/5 text-white border-l-2 border-indigo-500 ml-0 pl-[10px]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent ml-0 pl-[10px]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 py-2 px-2">
        {bottomItems.map((item) => {
          const active = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5',
                active
                  ? 'bg-white/5 text-white border-l-2 border-indigo-500 ml-0 pl-[10px]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent ml-0 pl-[10px]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}

import { useNavigate } from 'react-router-dom'
import { Search, Moon, Sun, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { logout } from '@/api/auth'
import { Breadcrumbs } from './Breadcrumbs'

export function TopBar() {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const { dark, toggle } = useThemeStore()

  const handleLogout = async () => {
    try { await logout() } catch {}
    clearAuth()
    navigate('/login')
  }

  const initials = (user?.full_name || user?.username || '??')
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <header className="h-[68px] border-b border-line bg-surface flex items-center justify-between px-7">
      <Breadcrumbs />
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/search')}
          className="theme-pill"
          aria-label="Search"
        >
          <Search className="h-3 w-3" />
          <span className="hidden sm:inline">Search</span>
          <span className="hidden md:inline text-ink-faint">Ctrl K</span>
        </button>

        <button onClick={toggle} className="theme-pill" aria-label="Toggle theme">
          {dark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
          <span className="hidden sm:inline">{dark ? 'Day' : 'Night'}</span>
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-line">
          <div className="h-8 w-8 border border-line-hot bg-surface-sunken flex items-center justify-center font-mono text-[10px] font-semibold tracking-button text-ember">
            {initials}
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-mono text-xs text-ink">{user?.full_name || user?.username}</span>
            <span className="font-mono text-[9px] uppercase tracking-kicker text-ink-faint mt-1">
              Operator
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-ink-faint hover:text-ember transition-colors"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}

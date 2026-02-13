import { useNavigate } from 'react-router-dom'
import { Search, Moon, Sun, LogOut, User } from 'lucide-react'
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

  return (
    <header className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between px-6">
      <Breadcrumbs />
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/search')}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden sm:inline text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">Ctrl+K</kbd>
        </button>
        <button onClick={toggle} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-gray-600">
          <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
            <User className="h-4 w-4 text-primary-600" />
          </div>
          <span className="text-sm font-medium hidden sm:inline">{user?.full_name || user?.username}</span>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}

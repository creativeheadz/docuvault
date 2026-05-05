import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  const { collapsed } = useSidebarStore()

  return (
    <div className="min-h-screen bg-surface text-ink">
      <Sidebar />
      <div className={cn('transition-all duration-200', collapsed ? 'ml-[64px]' : 'ml-[240px]')}>
        <TopBar />
        <main className="px-7 py-7 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

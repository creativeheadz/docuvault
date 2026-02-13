import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  const { collapsed } = useSidebarStore()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className={cn('transition-all duration-200', collapsed ? 'ml-[64px]' : 'ml-[256px]')}>
        <TopBar />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

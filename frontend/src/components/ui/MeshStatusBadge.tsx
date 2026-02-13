import { Wifi, WifiOff } from 'lucide-react'
import type { Configuration } from '@/types'

interface MeshStatusBadgeProps {
  config: Configuration
}

export function MeshStatusBadge({ config }: MeshStatusBadgeProps) {
  if (!config.mesh_node_id) return null

  if (config.mesh_agent_connected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <Wifi className="h-3 w-3" />
        Online
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <WifiOff className="h-3 w-3" />
      Offline
    </span>
  )
}

import { type ReactNode } from 'react'
import { InboxIcon } from 'lucide-react'

interface EmptyStateProps {
  message?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ message = 'No data found', description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 text-gray-300 dark:text-gray-600">
        {icon || <InboxIcon className="h-12 w-12" />}
      </div>
      <h3 className="text-sm font-medium text-gray-900 dark:text-white">{message}</h3>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

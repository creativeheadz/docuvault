import { type ReactNode } from 'react'
import { InboxIcon } from 'lucide-react'

interface EmptyStateProps {
  message?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ message = 'Nothing here yet', description, icon, action }: EmptyStateProps) {
  return (
    <div className="empty-instrument">
      <div className="text-ink-faint mb-5 inline-flex">
        {icon || <InboxIcon className="h-8 w-8" />}
      </div>
      <h3
        className="font-serif italic text-xl text-ink m-0"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380' }}
      >
        {message}
      </h3>
      {description && (
        <p className="mt-2 font-mono text-xs text-ink-dim leading-relaxed max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

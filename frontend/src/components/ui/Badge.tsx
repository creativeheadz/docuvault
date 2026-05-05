import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'ember'
  className?: string
}

const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'text-ink-dim',
  success: 'text-ok',
  warning: 'text-warn',
  danger: 'text-bad',
  info: 'text-info',
  ember: 'text-ember',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn('badge-instrument', variants[variant], className)}>
      {children}
    </span>
  )
}

import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Add ember left-edge accent on hover (interactive card affordance). */
  interactive?: boolean
}

export function Card({ className, children, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        interactive ? 'card-instrument' : 'surface p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('section-header', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'font-serif italic text-xl text-ink m-0',
        className
      )}
      style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 420' }}
      {...props}
    >
      {children}
    </h2>
  )
}

/** Mono uppercase tracked-out kicker — pair above titles. */
export function CardKicker({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('kicker', className)} {...props}>
      {children}
    </div>
  )
}

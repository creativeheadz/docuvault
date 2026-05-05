import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Render the textual loading caption alongside the dot. */
  caption?: string
}

const sizes: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
}

/**
 * Letterpress-instrument loading indicator: a single ember-square
 * pulses on/off — quieter than a Lucide spinner, fits the aesthetic.
 */
export function Spinner({ className, size = 'md', caption }: SpinnerProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span
        className={cn('bg-ember inline-block animate-instrument-pulse', sizes[size])}
        aria-hidden
      />
      {caption !== undefined && (
        <span className="font-mono text-xxs uppercase tracking-kicker text-ink-faint">
          {caption || 'Loading'}
        </span>
      )}
      <style>{`
        @keyframes instrument-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.35; transform: scale(0.6); }
        }
        .animate-instrument-pulse { animation: instrument-pulse 1.1s ease-in-out infinite; }
      `}</style>
    </span>
  )
}

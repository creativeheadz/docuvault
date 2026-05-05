import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="label-micro">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'input-field',
          error && 'border-bad focus:!border-bad',
          className
        )}
        {...props}
      />
      {error ? (
        <p className="mt-1.5 text-xxs font-mono uppercase tracking-button text-bad">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xxs font-mono text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
)
Input.displayName = 'Input'

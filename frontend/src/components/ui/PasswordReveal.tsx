import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { CopyButton } from './CopyButton'
import { cn } from '@/lib/utils'

interface PasswordRevealProps {
  onReveal: () => Promise<string>
  className?: string
}

export function PasswordReveal({ onReveal, className }: PasswordRevealProps) {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (visible) {
      setVisible(false)
      setValue('')
      return
    }
    setLoading(true)
    try {
      const pw = await onReveal()
      setValue(pw)
      setVisible(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-mono text-sm tnum-mono text-ink">
        {visible ? value : '••••••••••••'}
      </span>
      <button
        onClick={handleToggle}
        disabled={loading}
        className="p-1 text-ink-faint hover:text-ember transition-colors disabled:opacity-50"
        title={visible ? 'Hide' : 'Reveal'}
        type="button"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {visible && value && <CopyButton value={value} />}
    </div>
  )
}

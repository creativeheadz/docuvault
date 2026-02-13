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
      <span className="font-mono text-sm">
        {visible ? value : '••••••••••••'}
      </span>
      <button
        onClick={handleToggle}
        disabled={loading}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title={visible ? 'Hide' : 'Reveal'}
      >
        {visible ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
      </button>
      {visible && value && <CopyButton value={value} />}
    </div>
  )
}

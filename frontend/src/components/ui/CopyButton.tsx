import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/lib/clipboard'
import toast from 'react-hot-toast'

interface CopyButtonProps {
  value: string
  className?: string
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!(await copyToClipboard(value))) {
      toast.error('Could not copy — select the text and copy manually')
      return
    }
    setCopied(true)
    toast.success('Copied')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1 text-ink-faint hover:text-ember transition-colors',
        className
      )}
      title="Copy"
      type="button"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

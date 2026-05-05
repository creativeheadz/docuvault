import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
      window.addEventListener('keydown', handler)
      return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handler) }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh]">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          'modal-panel relative w-full mx-4 max-h-[88vh] overflow-auto',
          sizeMap[size],
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-7 pt-6 pb-3 border-b border-line">
            <h2
              className="font-serif italic text-2xl text-ink m-0"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 400' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-ink-faint hover:text-ember transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="px-7 py-6">{children}</div>
      </div>
    </div>
  )
}

import { Toaster, type ToastOptions } from 'react-hot-toast'

const baseStyle: ToastOptions['style'] = {
  borderRadius: '0',
  background: 'var(--bg-2)',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderLeft: '3px solid var(--ember)',
  fontFamily: 'var(--mono)',
  fontSize: '12px',
  letterSpacing: '0.02em',
  padding: '12px 14px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
  maxWidth: '380px',
}

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 4000,
        style: baseStyle,
        success: {
          style: { ...baseStyle, borderLeftColor: 'var(--green)' },
          iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-2)' },
        },
        error: {
          style: { ...baseStyle, borderLeftColor: 'var(--red)' },
          iconTheme: { primary: 'var(--red)', secondary: 'var(--bg-2)' },
        },
        loading: {
          style: { ...baseStyle, borderLeftColor: 'var(--warn)' },
        },
      }}
    />
  )
}

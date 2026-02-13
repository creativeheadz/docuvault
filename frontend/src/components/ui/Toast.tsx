import { Toaster } from 'react-hot-toast'

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '12px',
          background: '#fff',
          color: '#333',
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        },
      }}
    />
  )
}

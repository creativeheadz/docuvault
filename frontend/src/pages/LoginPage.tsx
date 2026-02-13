import { LoginForm } from '@/components/auth/LoginForm'
import { KeyRound } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto h-14 w-14 rounded-xl bg-indigo-600 flex items-center justify-center mb-4">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">DocuVault</h1>
          <p className="text-slate-400 mt-1">IT Documentation System</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { login, verifyMfa, getMe } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Shield } from 'lucide-react'
import toast from 'react-hot-toast'

export function LoginForm() {
  const navigate = useNavigate()
  const { setUser, setTokens } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [totpCode, setTotpCode] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(username, password)
      if (result.mfa_required) {
        setMfaRequired(true)
        setMfaToken(result.mfa_token!)
      } else {
        setTokens(result.access_token!, result.refresh_token!)
        const user = await getMe()
        setUser(user)
        toast.success('Welcome back!')
        navigate('/dashboard')
      }
    } catch {
      toast.error('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const tokens = await verifyMfa(mfaToken, totpCode)
      setTokens(tokens.access_token, tokens.refresh_token)
      const user = await getMe()
      setUser(user)
      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch {
      toast.error('Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    setMfaRequired(false)
    setMfaToken('')
    setTotpCode('')
  }

  if (mfaRequired) {
    return (
      <form onSubmit={handleMfaVerify} className="space-y-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <Shield className="h-8 w-8 text-primary-600" />
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>
        <Input
          id="totp_code"
          label="Verification Code"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          autoFocus
          required
          className="text-center text-lg tracking-widest"
        />
        <Button type="submit" loading={loading} disabled={totpCode.length !== 6} className="w-full">
          Verify
        </Button>
        <button
          type="button"
          onClick={handleBackToLogin}
          className="w-full text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          Back to login
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <Input
        id="username"
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter your username"
        autoFocus
        required
      />
      <Input
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter your password"
        required
      />
      <Button type="submit" loading={loading} className="w-full">
        Sign In
      </Button>
    </form>
  )
}

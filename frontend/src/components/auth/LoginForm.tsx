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
      <form onSubmit={handleMfaVerify} className="space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-line">
          <Shield className="h-4 w-4 text-ember" />
          <p className="font-mono text-xxs uppercase tracking-kicker text-ink-dim">
            Two-factor required
          </p>
        </div>
        <Input
          id="totp_code"
          label="Verification code"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          autoFocus
          required
          className="text-center text-lg tnum-mono tracking-[0.4em]"
        />
        <Button type="submit" loading={loading} disabled={totpCode.length !== 6} className="w-full">
          Verify
        </Button>
        <button
          type="button"
          onClick={handleBackToLogin}
          className="w-full font-mono text-xxs uppercase tracking-kicker text-ink-faint hover:text-ember transition-colors"
        >
          ← Back to sign-in
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <Input
        id="username"
        label="Operator"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="username"
        autoFocus
        required
      />
      <Input
        id="password"
        label="Pass-phrase"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        required
      />
      <Button type="submit" loading={loading} className="w-full">
        Open vault →
      </Button>
    </form>
  )
}

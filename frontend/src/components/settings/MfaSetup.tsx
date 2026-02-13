import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMfaStatus, setupMfa, enableMfa, disableMfa } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { CopyButton } from '@/components/ui/CopyButton'
import toast from 'react-hot-toast'
import type { TotpSetupResponse } from '@/types'

export function MfaSetup() {
  const queryClient = useQueryClient()
  const { user, setUser } = useAuthStore()
  const [showSetup, setShowSetup] = useState(false)
  const [showDisable, setShowDisable] = useState(false)
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const { data: status } = useQuery({
    queryKey: ['mfa-status'],
    queryFn: getMfaStatus,
  })

  const isEnabled = status?.totp_enabled ?? user?.totp_enabled ?? false

  const setupMutation = useMutation({
    mutationFn: setupMfa,
    onSuccess: (data) => {
      setSetupData(data)
      setShowSetup(true)
    },
    onError: () => toast.error('Failed to start 2FA setup'),
  })

  const enableMutation = useMutation({
    mutationFn: enableMfa,
    onSuccess: () => {
      toast.success('Two-factor authentication enabled')
      setShowSetup(false)
      setSetupData(null)
      setTotpCode('')
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] })
      if (user) setUser({ ...user, totp_enabled: true })
    },
    onError: () => toast.error('Invalid verification code'),
  })

  const disableMutation = useMutation({
    mutationFn: disableMfa,
    onSuccess: () => {
      toast.success('Two-factor authentication disabled')
      setShowDisable(false)
      setTotpCode('')
      queryClient.invalidateQueries({ queryKey: ['mfa-status'] })
      if (user) setUser({ ...user, totp_enabled: false })
    },
    onError: () => toast.error('Invalid verification code'),
  })

  const handleEnable = (e: React.FormEvent) => {
    e.preventDefault()
    enableMutation.mutate(totpCode)
  }

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault()
    disableMutation.mutate(totpCode)
  }

  const closeSetup = () => {
    setShowSetup(false)
    setSetupData(null)
    setTotpCode('')
  }

  const closeDisable = () => {
    setShowDisable(false)
    setTotpCode('')
  }

  return (
    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm flex items-center gap-2">
            Two-Factor Authentication
            <Badge variant={isEnabled ? 'success' : 'default'}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <div className="text-xs text-gray-500 mt-1">Add an extra layer of security to your account</div>
        </div>
      </div>
      <div className="mt-2">
        {isEnabled ? (
          <Button variant="danger" size="sm" onClick={() => setShowDisable(true)}>
            Disable 2FA
          </Button>
        ) : (
          <Button variant="secondary" size="sm" loading={setupMutation.isPending} onClick={() => setupMutation.mutate()}>
            Enable 2FA
          </Button>
        )}
      </div>

      <Modal open={showSetup} onClose={closeSetup} title="Set Up Two-Factor Authentication" size="sm">
        {setupData && (
          <form onSubmit={handleEnable} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            <div className="flex justify-center">
              <img src={setupData.qr_code} alt="TOTP QR Code" className="rounded-lg" width={200} height={200} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Manual entry key
              </label>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-600 font-mono text-sm break-all">
                <span className="flex-1">{setupData.secret}</span>
                <CopyButton value={setupData.secret} />
              </div>
            </div>
            <Input
              id="setup_totp_code"
              label="Verification Code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
              className="text-center text-lg tracking-widest"
            />
            <Button
              type="submit"
              loading={enableMutation.isPending}
              disabled={totpCode.length !== 6}
              className="w-full"
            >
              Verify & Enable
            </Button>
          </form>
        )}
      </Modal>

      <Modal open={showDisable} onClose={closeDisable} title="Disable Two-Factor Authentication" size="sm">
        <form onSubmit={handleDisable} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter a code from your authenticator app to confirm disabling 2FA.
          </p>
          <Input
            id="disable_totp_code"
            label="Verification Code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            autoFocus
            required
            className="text-center text-lg tracking-widest"
          />
          <Button
            type="submit"
            variant="danger"
            loading={disableMutation.isPending}
            disabled={totpCode.length !== 6}
            className="w-full"
          >
            Disable 2FA
          </Button>
        </form>
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRegistrarProviders,
  saveRegistrarSettings,
  testRegistrar,
} from '@/api/registrars'
import type { RegistrarProviderStatus } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import toast from 'react-hot-toast'

function ProviderRow({ provider }: { provider: RegistrarProviderStatus }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.name, ''])),
  )

  const saveMutation = useMutation({
    mutationFn: () => saveRegistrarSettings(provider.key, values),
    onSuccess: () => {
      toast.success(`${provider.label} settings saved`)
      queryClient.invalidateQueries({ queryKey: ['registrar-providers'] })
      queryClient.invalidateQueries({ queryKey: ['registrar-domains'] })
      setEditing(false)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Failed to save settings')
    },
  })

  const testMutation = useMutation({
    mutationFn: () => testRegistrar(provider.key),
    onSuccess: (data) => {
      if (data.success) toast.success(`${provider.label}: ${data.domain_count} domains`)
      else toast.error(data.error || 'Connection failed')
    },
    onError: () => toast.error('Connection test failed'),
  })

  return (
    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm flex items-center gap-2">
          {provider.label}
          {provider.configured ? (
            <Badge variant="success">Configured</Badge>
          ) : (
            <Badge variant="default">Not Configured</Badge>
          )}
        </div>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {provider.configured ? 'Edit' : 'Set up'}
            </Button>
            {provider.configured && (
              <Button
                size="sm"
                loading={testMutation.isPending}
                onClick={() => testMutation.mutate()}
              >
                Test
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveMutation.mutate()
          }}
          className="space-y-3 mt-3"
        >
          {provider.fields.map((f) => (
            <Input
              key={f.name}
              label={f.label + (f.optional ? ' (optional)' : '')}
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              value={values[f.name] ?? ''}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              placeholder={
                f.placeholder ||
                (provider.set_fields.includes(f.name) ? 're-enter to update' : '')
              }
              required={!f.optional}
            />
          ))}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saveMutation.isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

export function RegistrarsSettings() {
  const { data: providers, isLoading } = useQuery({
    queryKey: ['registrar-providers'],
    queryFn: getRegistrarProviders,
  })

  if (isLoading) {
    return <div className="text-xs text-gray-500 p-3">Loading registrars…</div>
  }

  return (
    <div className="space-y-3">
      {providers?.map((p) => <ProviderRow key={p.key} provider={p} />)}
    </div>
  )
}

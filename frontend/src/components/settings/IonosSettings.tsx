import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getIonosSettings, saveIonosSettings, testIonosConnection } from '@/api/ionos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import toast from 'react-hot-toast'

export function IonosSettings() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ prefix: '', secret: '' })
  const [editing, setEditing] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['ionos-settings'],
    queryFn: getIonosSettings,
  })

  useEffect(() => {
    if (settings?.prefix) {
      setForm((f) => ({ ...f, prefix: settings.prefix || '' }))
    }
  }, [settings])

  const isConfigured = settings?.configured ?? false

  const saveMutation = useMutation({
    mutationFn: () => saveIonosSettings(form),
    onSuccess: () => {
      toast.success('IONOS settings saved')
      queryClient.invalidateQueries({ queryKey: ['ionos-settings'] })
      queryClient.invalidateQueries({ queryKey: ['ionos-domains'] })
      setEditing(false)
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const testMutation = useMutation({
    mutationFn: testIonosConnection,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected! Found ${data.domain_count} domains`)
      } else {
        toast.error(data.error || 'Connection failed')
      }
    },
    onError: () => toast.error('Connection test failed'),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate()
  }

  if (!editing && isConfigured) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                API Key
                <Badge variant="success">Configured</Badge>
              </div>
              <div className="text-xs text-gray-500 mt-1 font-mono">
                {settings?.prefix}…
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" loading={testMutation.isPending} onClick={() => testMutation.mutate()}>
              Test Connection
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
        <div className="font-medium text-sm flex items-center gap-2 mb-3">
          API Key
          {!isConfigured && <Badge variant="default">Not Configured</Badge>}
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            label="Public Prefix"
            value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value })}
            placeholder="e.g. de85e10635164353…"
            required
          />
          <Input
            label="Secret"
            type="password"
            autoComplete="off"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            placeholder={isConfigured ? 're-enter secret to update' : ''}
            required
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saveMutation.isPending}>Save</Button>
            {isConfigured && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

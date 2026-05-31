import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUptimeSettings, saveUptimeSettings, testUptimeConnection } from '@/api/uptime'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import toast from 'react-hot-toast'

export function UptimeSettings() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ url: '', api_key: '' })
  const [editing, setEditing] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['uptime-settings'],
    queryFn: getUptimeSettings,
  })

  useEffect(() => {
    if (settings?.url) {
      setForm((f) => ({ ...f, url: settings.url || '' }))
    }
  }, [settings])

  const isConfigured = settings?.configured ?? false

  const saveMutation = useMutation({
    mutationFn: () => saveUptimeSettings(form),
    onSuccess: () => {
      toast.success('Uptime Kuma settings saved')
      queryClient.invalidateQueries({ queryKey: ['uptime-settings'] })
      queryClient.invalidateQueries({ queryKey: ['uptime-monitors'] })
      setForm((f) => ({ ...f, api_key: '' }))
      setEditing(false)
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const testMutation = useMutation({
    mutationFn: testUptimeConnection,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected! Tracking ${data.monitor_count} monitors`)
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
          <div className="font-medium text-sm flex items-center gap-2">
            Connection
            <Badge variant="success">Configured</Badge>
          </div>
          <div className="text-xs text-gray-500 mt-1">{settings?.url}</div>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
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
          Connection
          {!isConfigured && <Badge variant="default">Not Configured</Badge>}
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            label="Server URL"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://uptime.example.com"
            required
          />
          <Input
            label="API Key"
            type="password"
            autoComplete="off"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder={isConfigured ? '(unchanged)' : 'uk2_…'}
            required={!isConfigured}
          />
          <p className="text-xs text-gray-500">
            Create a key in Uptime Kuma under Settings → API Keys. Used against the
            Prometheus <code>/metrics</code> endpoint.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saveMutation.isPending}>
              Save
            </Button>
            {isConfigured && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setForm((f) => ({ ...f, api_key: '' }))
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

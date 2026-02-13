import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMeshSettings, saveMeshSettings, testMeshConnection, triggerMeshSync } from '@/api/meshcentral'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import toast from 'react-hot-toast'

export function MeshCentralSettings() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ url: '', username: '', password: '' })
  const [editing, setEditing] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['mesh-settings'],
    queryFn: getMeshSettings,
  })

  useEffect(() => {
    if (settings?.url) {
      setForm((f) => ({ ...f, url: settings.url || '', username: settings.username || '' }))
    }
  }, [settings])

  const isConfigured = settings?.configured ?? false

  const saveMutation = useMutation({
    mutationFn: () => saveMeshSettings(form),
    onSuccess: () => {
      toast.success('MeshCentral settings saved')
      queryClient.invalidateQueries({ queryKey: ['mesh-settings'] })
      setEditing(false)
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const testMutation = useMutation({
    mutationFn: testMeshConnection,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected! Found ${data.mesh_count} meshes and ${data.node_count} devices`)
      } else {
        toast.error(data.error || 'Connection failed')
      }
    },
    onError: () => toast.error('Connection test failed'),
  })

  const syncMutation = useMutation({
    mutationFn: triggerMeshSync,
    onSuccess: (data) => {
      const parts = []
      if (data.orgs_created) parts.push(`${data.orgs_created} orgs created`)
      if (data.orgs_updated) parts.push(`${data.orgs_updated} orgs updated`)
      if (data.devices_created) parts.push(`${data.devices_created} devices created`)
      if (data.devices_updated) parts.push(`${data.devices_updated} devices updated`)
      parts.push(`${data.online} online, ${data.offline} offline`)
      toast.success(`Sync complete: ${parts.join(', ')}`)
      queryClient.invalidateQueries({ queryKey: ['configurations'] })
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: () => toast.error('Sync failed'),
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
                Connection
                <Badge variant="success">Configured</Badge>
              </div>
              <div className="text-xs text-gray-500 mt-1">{settings?.url}</div>
              <div className="text-xs text-gray-500">User: {settings?.username}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="secondary" size="sm" loading={testMutation.isPending} onClick={() => testMutation.mutate()}>
              Test Connection
            </Button>
            <Button size="sm" loading={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
              Sync Now
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
            placeholder="https://meshcentral.example.com"
            required
          />
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={isConfigured ? '(unchanged)' : ''}
            required={!isConfigured}
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

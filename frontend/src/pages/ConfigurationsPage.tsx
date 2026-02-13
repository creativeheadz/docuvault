import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfigurations, createConfiguration, updateConfiguration, deleteConfiguration } from '@/api/configurations'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Server, Plus, Pencil, Trash2, Monitor, Terminal } from 'lucide-react'
import type { Configuration } from '@/types'
import { getMeshRemoteUrls } from '@/api/meshcentral'
import { MeshStatusBadge } from '@/components/ui/MeshStatusBadge'
import toast from 'react-hot-toast'

export default function ConfigurationsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Configuration | null>(null)
  const [form, setForm] = useState({ name: '', organization_id: '', configuration_type: '', hostname: '', ip_address: '', serial_number: '', operating_system: '', manufacturer: '', model: '', notes: '' })

  const { data: configs = [], isLoading } = useQuery({ queryKey: ['configurations'], queryFn: () => getConfigurations() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => editing ? updateConfiguration(editing.id, data) : createConfiguration(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['configurations'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConfiguration,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['configurations'] }); toast.success('Deleted') },
  })

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm({ name: '', organization_id: '', configuration_type: '', hostname: '', ip_address: '', serial_number: '', operating_system: '', manufacturer: '', model: '', notes: '' }) }
  const handleEdit = (item: Configuration) => { setEditing(item); setForm({ name: item.name, organization_id: item.organization_id, configuration_type: item.configuration_type || '', hostname: item.hostname || '', ip_address: item.ip_address || '', serial_number: item.serial_number || '', operating_system: item.operating_system || '', manufacturer: item.manufacturer || '', model: item.model || '', notes: item.notes || '' }); setFormOpen(true) }

  const columns: Column<Configuration>[] = [
    { key: 'name', header: 'Name', render: (i) => <span className="font-medium">{i.name}</span> },
    { key: 'configuration_type', header: 'Type', render: (i) => i.configuration_type || '—' },
    { key: 'hostname', header: 'Hostname', render: (i) => <span className="font-mono text-xs">{i.hostname || '—'}</span> },
    { key: 'ip_address', header: 'IP Address', render: (i) => <span className="font-mono text-xs">{i.ip_address || '—'}</span> },
    { key: 'operating_system', header: 'OS', render: (i) => i.operating_system || '—' },
    { key: 'status', header: 'Status', render: (i) => <MeshStatusBadge config={i} /> },
    { key: 'actions', header: '', className: 'w-36', render: (i) => (
      <div className="flex gap-1">
        {i.mesh_node_id && (
          <>
            <button
              onClick={async (e) => { e.stopPropagation(); try { const urls = await getMeshRemoteUrls(i.id); if (urls.desktop) window.open(urls.desktop, '_blank') } catch { toast.error('Failed to get remote URL') } }}
              className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Remote Desktop"
            ><Monitor className="h-4 w-4 text-blue-500" /></button>
            <button
              onClick={async (e) => { e.stopPropagation(); try { const urls = await getMeshRemoteUrls(i.id); if (urls.terminal) window.open(urls.terminal, '_blank') } catch { toast.error('Failed to get remote URL') } }}
              className="p-1 hover:bg-green-50 dark:hover:bg-green-900/20 rounded" title="Terminal"
            ><Terminal className="h-4 w-4 text-green-500" /></button>
          </>
        )}
        <button onClick={(e) => { e.stopPropagation(); handleEdit(i) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil className="h-4 w-4 text-gray-400" /></button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(i.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Trash2 className="h-4 w-4 text-red-400" /></button>
      </div>
    )},
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurations</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Configuration</Button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={configs} loading={isLoading} emptyMessage="No configurations yet" emptyIcon={<Server className="h-12 w-12" />} />
      </div>
      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Configuration' : 'New Configuration'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form) }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Organization</label>
              <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
                <option value="">Select...</option>
                {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Type" value={form.configuration_type} onChange={(e) => setForm({ ...form, configuration_type: e.target.value })} placeholder="e.g., Server, Workstation, Switch" />
            <Input label="Hostname" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="IP Address" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
            <Input label="Serial Number" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="OS" value={form.operating_system} onChange={(e) => setForm({ ...form, operating_system: e.target.value })} />
            <Input label="Manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            <Input label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

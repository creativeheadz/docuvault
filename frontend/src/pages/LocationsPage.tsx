import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLocations, createLocation, updateLocation, deleteLocation } from '@/api/locations'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { MapPin, Plus, Pencil, Trash2 } from 'lucide-react'
import type { Location } from '@/types'
import toast from 'react-hot-toast'

export default function LocationsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState({ name: '', organization_id: '', address_line1: '', city: '', state: '', zip_code: '', country: '', phone: '', is_primary: false, notes: '' })

  const { data: locations = [], isLoading } = useQuery({ queryKey: ['locations'], queryFn: () => getLocations() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => editing ? updateLocation(editing.id, data) : createLocation(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['locations'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['locations'] }); toast.success('Deleted') },
  })

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm({ name: '', organization_id: '', address_line1: '', city: '', state: '', zip_code: '', country: '', phone: '', is_primary: false, notes: '' }) }
  const handleEdit = (item: Location) => { setEditing(item); setForm({ name: item.name, organization_id: item.organization_id, address_line1: item.address_line1 || '', city: item.city || '', state: item.state || '', zip_code: item.zip_code || '', country: item.country || '', phone: item.phone || '', is_primary: item.is_primary, notes: item.notes || '' }); setFormOpen(true) }

  const columns: Column<Location>[] = [
    { key: 'name', header: 'Name', render: (i) => <span className="font-medium">{i.name}</span> },
    { key: 'city', header: 'City', render: (i) => i.city || '—' },
    { key: 'state', header: 'State', render: (i) => i.state || '—' },
    { key: 'country', header: 'Country', render: (i) => i.country || '—' },
    { key: 'actions', header: '', className: 'w-24', render: (i) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); handleEdit(i) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil className="h-4 w-4 text-gray-400" /></button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(i.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Trash2 className="h-4 w-4 text-red-400" /></button>
      </div>
    )},
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Locations</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Location</Button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={locations} loading={isLoading} emptyMessage="No locations yet" emptyIcon={<MapPin className="h-12 w-12" />} />
      </div>
      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Location' : 'New Location'} size="lg">
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
          <Input label="Address" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <Input label="ZIP" value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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

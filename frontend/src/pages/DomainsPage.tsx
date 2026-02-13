import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomains, createDomain, updateDomain, deleteDomain } from '@/api/domains'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Globe, Plus, Pencil, Trash2 } from 'lucide-react'
import type { Domain } from '@/types'
import toast from 'react-hot-toast'

export default function DomainsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Domain | null>(null)
  const [form, setForm] = useState({ domain_name: '', organization_id: '', registrar: '', registration_date: '', expiration_date: '', auto_renew: false, notes: '' })

  const { data: domains = [], isLoading } = useQuery({ queryKey: ['domains'], queryFn: () => getDomains() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => editing ? updateDomain(editing.id, data) : createDomain(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['domains'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDomain,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['domains'] }); toast.success('Deleted') },
  })

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm({ domain_name: '', organization_id: '', registrar: '', registration_date: '', expiration_date: '', auto_renew: false, notes: '' }) }
  const handleEdit = (item: Domain) => { setEditing(item); setForm({ domain_name: item.domain_name, organization_id: item.organization_id, registrar: item.registrar || '', registration_date: item.registration_date || '', expiration_date: item.expiration_date || '', auto_renew: item.auto_renew, notes: item.notes || '' }); setFormOpen(true) }

  const columns: Column<Domain>[] = [
    { key: 'domain_name', header: 'Domain', render: (i) => <span className="font-medium font-mono">{i.domain_name}</span> },
    { key: 'registrar', header: 'Registrar', render: (i) => i.registrar || '—' },
    { key: 'expiration_date', header: 'Expires', render: (i) => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{i.expiration_date || '—'}</span>
        <StatusBadge date={i.expiration_date} />
      </div>
    )},
    { key: 'auto_renew', header: 'Auto-Renew', render: (i) => i.auto_renew ? 'Yes' : 'No' },
    { key: 'actions', header: '', className: 'w-24', render: (i) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); handleEdit(i) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil className="h-4 w-4 text-gray-400" /></button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(i.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Trash2 className="h-4 w-4 text-red-400" /></button>
      </div>
    )},
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, unknown> = { ...form }
    if (!data.registration_date) data.registration_date = null
    if (!data.expiration_date) data.expiration_date = null
    saveMutation.mutate(data)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Domains</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Domain</Button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={domains} loading={isLoading} emptyMessage="No domains tracked" emptyIcon={<Globe className="h-12 w-12" />} />
      </div>
      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Domain' : 'New Domain'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Domain Name" value={form.domain_name} onChange={(e) => setForm({ ...form, domain_name: e.target.value })} required placeholder="example.com" />
            <Input label="Registrar" value={form.registrar} onChange={(e) => setForm({ ...form, registrar: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Registration Date" type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} />
            <Input label="Expiration Date" type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.auto_renew} onChange={(e) => setForm({ ...form, auto_renew: e.target.checked })} className="rounded border-gray-300" />
            Auto-Renew
          </label>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

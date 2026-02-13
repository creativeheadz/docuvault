import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContacts, createContact, updateContact, deleteContact } from '@/api/contacts'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Users, Plus, Pencil, Trash2 } from 'lucide-react'
import type { Contact } from '@/types'
import toast from 'react-hot-toast'

export default function ContactsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', organization_id: '', title: '', email: '', phone: '', mobile: '', notes: '' })

  const { data: contacts = [], isLoading } = useQuery({ queryKey: ['contacts'], queryFn: () => getContacts() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => editing ? updateContact(editing.id, data) : createContact(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); toast.success('Deleted') },
  })

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm({ first_name: '', last_name: '', organization_id: '', title: '', email: '', phone: '', mobile: '', notes: '' }) }
  const handleEdit = (item: Contact) => { setEditing(item); setForm({ first_name: item.first_name, last_name: item.last_name, organization_id: item.organization_id, title: item.title || '', email: item.email || '', phone: item.phone || '', mobile: item.mobile || '', notes: item.notes || '' }); setFormOpen(true) }

  const columns: Column<Contact>[] = [
    { key: 'name', header: 'Name', render: (i) => <span className="font-medium">{i.first_name} {i.last_name}</span> },
    { key: 'title', header: 'Title', render: (i) => i.title || '—' },
    { key: 'email', header: 'Email', render: (i) => i.email || '—' },
    { key: 'phone', header: 'Phone', render: (i) => i.phone || '—' },
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contacts</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Contact</Button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={contacts} loading={isLoading} emptyMessage="No contacts yet" emptyIcon={<Users className="h-12 w-12" />} />
      </div>
      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Contact' : 'New Contact'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form) }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
            <Input label="Last Name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
          </div>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <Input label="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

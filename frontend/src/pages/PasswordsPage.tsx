import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPasswords, createPassword, updatePassword, deletePassword, revealPassword } from '@/api/passwords'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PasswordReveal } from '@/components/ui/PasswordReveal'
import { CopyButton } from '@/components/ui/CopyButton'
import { KeyRound, Plus, Pencil, Trash2 } from 'lucide-react'
import type { Password } from '@/types'
import toast from 'react-hot-toast'

export default function PasswordsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Password | null>(null)
  const [form, setForm] = useState({ name: '', organization_id: '', url: '', username: '', password_value: '', notes: '' })

  const { data: passwords = [], isLoading } = useQuery({ queryKey: ['passwords'], queryFn: () => getPasswords() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => editing ? updatePassword(editing.id, data) : createPassword(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['passwords'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePassword,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['passwords'] }); toast.success('Deleted') },
  })

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm({ name: '', organization_id: '', url: '', username: '', password_value: '', notes: '' }) }
  const handleEdit = (item: Password) => { setEditing(item); setForm({ name: item.name, organization_id: item.organization_id, url: item.url || '', username: item.username || '', password_value: '', notes: item.notes || '' }); setFormOpen(true) }

  const columns: Column<Password>[] = [
    { key: 'name', header: 'Name', render: (i) => (
      <div>
        <span className="font-medium">{i.name}</span>
        {i.url && <span className="block text-xs text-gray-400 truncate max-w-xs">{i.url}</span>}
      </div>
    )},
    { key: 'username', header: 'Username', render: (i) => i.username ? (
      <div className="flex items-center gap-1"><span className="font-mono text-xs">{i.username}</span><CopyButton value={i.username} /></div>
    ) : '—' },
    { key: 'password', header: 'Password', render: (i) => <PasswordReveal onReveal={() => revealPassword(i.id)} /> },
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Passwords</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Password</Button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={passwords} loading={isLoading} emptyMessage="No passwords stored" emptyIcon={<KeyRound className="h-12 w-12" />} />
      </div>
      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit Password' : 'New Password'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form) }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <Input label={editing ? 'New Password (leave blank to keep)' : 'Password'} type="password" value={form.password_value} onChange={(e) => setForm({ ...form, password_value: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[60px]" rows={2} />
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

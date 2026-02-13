import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSSLCertificates, createSSLCertificate, updateSSLCertificate, deleteSSLCertificate } from '@/api/sslCertificates'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ShieldCheck, Plus, Pencil, Trash2 } from 'lucide-react'
import type { SSLCertificate } from '@/types'
import toast from 'react-hot-toast'

export default function SSLCertificatesPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SSLCertificate | null>(null)
  const [form, setForm] = useState({ common_name: '', organization_id: '', issuer: '', issued_date: '', expiration_date: '', key_algorithm: '', notes: '' })

  const { data: certs = [], isLoading } = useQuery({ queryKey: ['ssl-certificates'], queryFn: () => getSSLCertificates() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => editing ? updateSSLCertificate(editing.id, data) : createSSLCertificate(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] }); toast.success(editing ? 'Updated' : 'Created'); handleClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSSLCertificate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] }); toast.success('Deleted') },
  })

  const handleClose = () => { setFormOpen(false); setEditing(null); setForm({ common_name: '', organization_id: '', issuer: '', issued_date: '', expiration_date: '', key_algorithm: '', notes: '' }) }
  const handleEdit = (item: SSLCertificate) => { setEditing(item); setForm({ common_name: item.common_name, organization_id: item.organization_id, issuer: item.issuer || '', issued_date: item.issued_date || '', expiration_date: item.expiration_date || '', key_algorithm: item.key_algorithm || '', notes: item.notes || '' }); setFormOpen(true) }

  const columns: Column<SSLCertificate>[] = [
    { key: 'common_name', header: 'Common Name', render: (i) => <span className="font-medium font-mono">{i.common_name}</span> },
    { key: 'issuer', header: 'Issuer', render: (i) => i.issuer || '—' },
    { key: 'expiration_date', header: 'Expires', render: (i) => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{i.expiration_date || '—'}</span>
        <StatusBadge date={i.expiration_date} />
      </div>
    )},
    { key: 'key_algorithm', header: 'Algorithm', render: (i) => i.key_algorithm || '—' },
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
    if (!data.issued_date) data.issued_date = null
    if (!data.expiration_date) data.expiration_date = null
    saveMutation.mutate(data)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SSL Certificates</h1>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Certificate</Button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={certs} loading={isLoading} emptyMessage="No SSL certificates tracked" emptyIcon={<ShieldCheck className="h-12 w-12" />} />
      </div>
      <Modal open={formOpen} onClose={handleClose} title={editing ? 'Edit SSL Certificate' : 'New SSL Certificate'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Common Name" value={form.common_name} onChange={(e) => setForm({ ...form, common_name: e.target.value })} required placeholder="*.example.com" />
            <Input label="Issuer" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Let's Encrypt" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Issued Date" type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
            <Input label="Expiration Date" type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
            <Input label="Algorithm" value={form.key_algorithm} onChange={(e) => setForm({ ...form, key_algorithm: e.target.value })} placeholder="RSA 2048" />
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

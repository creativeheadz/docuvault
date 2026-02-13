import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createOrganization, updateOrganization } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Organization } from '@/types'
import toast from 'react-hot-toast'

interface OrgFormProps {
  open: boolean
  onClose: () => void
  organization?: Organization | null
}

export function OrgForm({ open, onClose, organization }: OrgFormProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    description: '',
    website: '',
    phone: '',
    address: '',
  })

  useEffect(() => {
    if (organization) {
      setForm({
        name: organization.name || '',
        description: organization.description || '',
        website: organization.website || '',
        phone: organization.phone || '',
        address: organization.address || '',
      })
    } else {
      setForm({ name: '', description: '', website: '', phone: '', address: '' })
    }
  }, [organization, open])

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      organization ? updateOrganization(organization.id, data) : createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success(organization ? 'Organization updated' : 'Organization created')
      onClose()
    },
    onError: () => toast.error('Something went wrong'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={organization ? 'Edit Organization' : 'New Organization'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input id="name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input-field min-h-[80px]"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input id="website" label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <Input id="phone" label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <Input id="address" label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>{organization ? 'Save Changes' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}

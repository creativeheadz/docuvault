import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChecklists, getChecklist, createChecklist, deleteChecklist, createChecklistItem, toggleChecklistItem, deleteChecklistItem } from '@/api/checklists'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { CheckSquare, Plus, Trash2, Square, CheckSquare as CheckedSquare } from 'lucide-react'
import type { Checklist, ChecklistItem } from '@/types'
import toast from 'react-hot-toast'

export default function ChecklistsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [itemText, setItemText] = useState('')
  const [form, setForm] = useState({ name: '', description: '', organization_id: '' })

  const { data: checklists = [] } = useQuery({ queryKey: ['checklists'], queryFn: () => getChecklists() })
  const { data: detail } = useQuery({ queryKey: ['checklist', selected], queryFn: () => getChecklist(selected!), enabled: !!selected })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const createMutation = useMutation({
    mutationFn: () => createChecklist(form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklists'] }); toast.success('Created'); setFormOpen(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChecklist,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklists'] }); setSelected(null); toast.success('Deleted') },
  })

  const addItemMutation = useMutation({
    mutationFn: () => createChecklistItem(selected!, { content: itemText, sort_order: (detail?.items?.length || 0) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklist', selected] }); setItemText('') },
  })

  const toggleMutation = useMutation({
    mutationFn: (itemId: string) => toggleChecklistItem(selected!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist', selected] }),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteChecklistItem(selected!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist', selected] }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Checklists</h1>
        <Button onClick={() => { setForm({ name: '', description: '', organization_id: '' }); setFormOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />New Checklist
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-2">
          {checklists.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${selected === c.id ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary-500" />
                <span className="text-sm font-medium">{c.name}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(c.id) }}>
                <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
              </button>
            </button>
          ))}
          {!checklists.length && <p className="text-sm text-gray-400 text-center py-4">No checklists yet</p>}
        </div>

        <div className="col-span-2">
          {detail ? (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-1">{detail.name}</h2>
              {detail.description && <p className="text-sm text-gray-500 mb-4">{detail.description}</p>}

              <div className="space-y-1 mb-4">
                {detail.items?.map((item: ChecklistItem) => (
                  <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
                    <button onClick={() => toggleMutation.mutate(item.id)} className="shrink-0">
                      {item.is_checked
                        ? <CheckedSquare className="h-5 w-5 text-green-500" />
                        : <Square className="h-5 w-5 text-gray-300" />}
                    </button>
                    <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-gray-400' : ''}`}>{item.content}</span>
                    <button onClick={() => deleteItemMutation.mutate(item.id)} className="opacity-0 group-hover:opacity-100">
                      <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); if (itemText.trim()) addItemMutation.mutate() }} className="flex gap-2">
                <input
                  value={itemText}
                  onChange={(e) => setItemText(e.target.value)}
                  placeholder="Add an item..."
                  className="input-field flex-1"
                />
                <Button type="submit" size="sm" disabled={!itemText.trim()}>Add</Button>
              </form>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <CheckSquare className="h-12 w-12 mb-3" />
              <p>Select a checklist</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New Checklist">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

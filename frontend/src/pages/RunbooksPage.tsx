import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRunbooks, getRunbook, createRunbook, deleteRunbook, createRunbookStep, updateRunbookStep, deleteRunbookStep } from '@/api/runbooks'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { BookOpen, Plus, Trash2, CheckCircle, Circle, ChevronDown, ChevronRight } from 'lucide-react'
import type { Runbook, RunbookStep } from '@/types'
import toast from 'react-hot-toast'

export default function RunbooksPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [stepFormOpen, setStepFormOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', organization_id: '' })
  const [stepForm, setStepForm] = useState({ title: '', step_number: 0 })
  const [stepContent, setStepContent] = useState<unknown>(null)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const { data: runbooks = [] } = useQuery({ queryKey: ['runbooks'], queryFn: () => getRunbooks() })
  const { data: detail } = useQuery({ queryKey: ['runbook', selected], queryFn: () => getRunbook(selected!), enabled: !!selected })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const createMutation = useMutation({
    mutationFn: () => createRunbook(form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['runbooks'] }); toast.success('Created'); setFormOpen(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRunbook,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['runbooks'] }); setSelected(null); toast.success('Deleted') },
  })

  const addStepMutation = useMutation({
    mutationFn: () => createRunbookStep(selected!, { ...stepForm, content: stepContent }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['runbook', selected] }); setStepFormOpen(false); toast.success('Step added') },
  })

  const toggleStepMutation = useMutation({
    mutationFn: (step: RunbookStep) => updateRunbookStep(selected!, step.id, { is_completed: !step.is_completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runbook', selected] }),
  })

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) => deleteRunbookStep(selected!, stepId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runbook', selected] }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Runbooks</h1>
        <Button onClick={() => { setForm({ name: '', description: '', organization_id: '' }); setFormOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />New Runbook
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-2">
          {runbooks.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${selected === r.id ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary-500" />
                <span className="text-sm font-medium">{r.name}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(r.id) }}>
                <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
              </button>
            </button>
          ))}
          {!runbooks.length && <p className="text-sm text-gray-400 text-center py-4">No runbooks yet</p>}
        </div>

        <div className="col-span-2">
          {detail ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{detail.name}</h2>
                  {detail.description && <p className="text-sm text-gray-500">{detail.description}</p>}
                </div>
                <Button size="sm" onClick={() => { setStepForm({ title: '', step_number: (detail.steps?.length || 0) + 1 }); setStepContent(null); setStepFormOpen(true) }}>
                  <Plus className="h-4 w-4 mr-1" />Add Step
                </Button>
              </div>

              <div className="space-y-2">
                {detail.steps?.map((step: RunbookStep) => (
                  <Card key={step.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleStepMutation.mutate(step)}>
                        {step.is_completed
                          ? <CheckCircle className="h-5 w-5 text-green-500" />
                          : <Circle className="h-5 w-5 text-gray-300" />}
                      </button>
                      <span className="font-mono text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        Step {step.step_number}
                      </span>
                      <span className={`font-medium flex-1 ${step.is_completed ? 'line-through text-gray-400' : ''}`}>{step.title}</span>
                      <button onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)} className="p-1">
                        {expandedStep === step.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <button onClick={() => deleteStepMutation.mutate(step.id)} className="p-1 hover:bg-gray-100 rounded">
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                    {expandedStep === step.id && !!step.content && (
                      <div className="mt-3 pl-8 prose dark:prose-invert text-sm max-w-none">
                        <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-auto">
                          {JSON.stringify(step.content as Record<string, unknown>, null, 2)}
                        </pre>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <BookOpen className="h-12 w-12 mb-3" />
              <p>Select a runbook</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New Runbook">
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

      <Modal open={stepFormOpen} onClose={() => setStepFormOpen(false)} title="Add Step" size="lg">
        <form onSubmit={(e) => { e.preventDefault(); addStepMutation.mutate() }} className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Input label="Step #" type="number" value={String(stepForm.step_number)} onChange={(e) => setStepForm({ ...stepForm, step_number: Number(e.target.value) })} />
            <div className="col-span-3">
              <Input label="Title" value={stepForm.title} onChange={(e) => setStepForm({ ...stepForm, title: e.target.value })} required />
            </div>
          </div>
          <RichTextEditor content={stepContent} onChange={setStepContent} placeholder="Step instructions..." />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setStepFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={addStepMutation.isPending}>Add Step</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTasks, createTask, updateTask, deleteTask } from '@/api/tasks'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  ListTodo, Plus, Trash2, ChevronDown, ChevronRight, Circle, CheckCircle2,
  CircleDashed, AlertCircle, Pause, Archive, Lightbulb,
} from 'lucide-react'
import type { Task, TaskStatus, TaskPriority } from '@/types'
import toast from 'react-hot-toast'

const STATUS_META: Record<TaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  idea: { label: 'Idea', icon: Lightbulb, color: 'text-amber-500' },
  todo: { label: 'To do', icon: Circle, color: 'text-ink-faint' },
  in_progress: { label: 'In progress', icon: CircleDashed, color: 'text-info' },
  blocked: { label: 'Blocked', icon: AlertCircle, color: 'text-warn' },
  done: { label: 'Done', icon: CheckCircle2, color: 'text-ok' },
  archived: { label: 'Archived', icon: Archive, color: 'text-ink-faint opacity-50' },
}

const STATUS_ORDER: TaskStatus[] = ['idea', 'todo', 'in_progress', 'blocked', 'done', 'archived']
const PRIORITIES: TaskPriority[] = ['low', 'med', 'high']

const MAX_UI_DEPTH = 2 // 0=project, 1=task, 2=subtask

interface TaskNodeProps {
  task: Task
  depth: number
  filterStatus: TaskStatus | 'all'
  orgFilter: string
  onEdit: (t: Task) => void
}

function TaskNode({ task, depth, filterStatus, orgFilter, onEdit }: TaskNodeProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(depth === 0)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const { data: children = [] } = useQuery({
    queryKey: ['tasks', 'children', task.id, filterStatus, orgFilter],
    queryFn: () => getTasks({
      parent_id: task.id,
      status: filterStatus === 'all' ? undefined : filterStatus,
    }),
    enabled: expanded && task.child_count > 0,
  })

  const updateMut = useMutation({
    mutationFn: (body: Partial<Task>) => updateTask(task.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Deleted')
    },
  })

  const addChildMut = useMutation({
    mutationFn: () => createTask({
      title: newTitle,
      parent_id: task.id,
      organization_id: task.organization_id ?? undefined,
      status: 'todo',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setNewTitle('')
      setAddOpen(false)
      setExpanded(true)
    },
  })

  const meta = STATUS_META[task.status]
  const StatusIcon = meta.icon
  const canHaveChildren = depth < MAX_UI_DEPTH
  const indent = depth * 24

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-raised border border-transparent hover:border-line"
        style={{ marginLeft: indent }}
      >
        {task.child_count > 0 ? (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 text-ink-faint hover:text-ink">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <button
          onClick={() => {
            const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
            updateMut.mutate({ status: next })
          }}
          title={`Mark ${task.status === 'done' ? 'not done' : 'done'}`}
          className="shrink-0"
        >
          <StatusIcon className={`h-4 w-4 ${meta.color}`} />
        </button>

        <button
          onClick={() => onEdit(task)}
          className={`flex-1 text-left text-sm truncate ${task.status === 'done' ? 'line-through text-ink-faint' : ''}`}
        >
          {task.title}
        </button>

        <select
          value={task.status}
          onChange={(e) => updateMut.mutate({ status: e.target.value as TaskStatus })}
          onClick={(e) => e.stopPropagation()}
          className="text-xs bg-transparent border border-line rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>

        {task.priority && (
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            task.priority === 'high' ? 'border-bad text-bad' :
            task.priority === 'med' ? 'border-warn text-warn' :
            'border-line text-ink-faint'
          }`}>{task.priority}</span>
        )}

        {task.due_date && (
          <span className="text-[11px] text-ink-faint">
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}

        {canHaveChildren && (
          <button
            onClick={() => setAddOpen(!addOpen)}
            className="p-1 text-ink-faint hover:text-ember opacity-0 group-hover:opacity-100"
            title="Add subtask"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          onClick={() => { if (confirm(`Delete "${task.title}"${task.child_count ? ' and all children' : ''}?`)) deleteMut.mutate() }}
          className="p-1 text-ink-faint hover:text-bad opacity-0 group-hover:opacity-100"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {addOpen && canHaveChildren && (
        <div className="flex gap-2 mt-1 mb-1" style={{ marginLeft: indent + 28 }}>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New subtask title..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) addChildMut.mutate()
              if (e.key === 'Escape') { setAddOpen(false); setNewTitle('') }
            }}
            className="flex-1"
          />
          <Button size="sm" onClick={() => newTitle.trim() && addChildMut.mutate()} loading={addChildMut.isPending}>Add</Button>
          <Button size="sm" variant="secondary" onClick={() => { setAddOpen(false); setNewTitle('') }}>Cancel</Button>
        </div>
      )}

      {expanded && children.map((child) => (
        <TaskNode
          key={child.id}
          task={child}
          depth={depth + 1}
          filterStatus={filterStatus}
          orgFilter={orgFilter}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}


export default function TasksPage() {
  const queryClient = useQueryClient()
  const [orgFilter, setOrgFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [groupByStatus, setGroupByStatus] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<{
    title: string
    description: string
    organization_id: string
    status: TaskStatus
    priority: TaskPriority | ''
    due_date: string
  }>({ title: '', description: '', organization_id: '', status: 'todo', priority: '', due_date: '' })

  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })

  const { data: roots = [] } = useQuery({
    queryKey: ['tasks', 'roots', orgFilter, statusFilter, includeArchived],
    queryFn: () => getTasks({
      root_only: true,
      organization_id: orgFilter || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      include_archived: includeArchived,
    }),
  })

  const createMut = useMutation({
    mutationFn: () => createTask({
      title: form.title,
      description: form.description || undefined,
      organization_id: form.organization_id || undefined,
      status: form.status,
      priority: form.priority || undefined,
      due_date: form.due_date || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setFormOpen(false)
      toast.success('Created')
    },
  })

  const updateMut = useMutation({
    mutationFn: () => updateTask(editing!.id, {
      title: form.title,
      description: form.description,
      organization_id: form.organization_id || null,
      status: form.status,
      priority: form.priority || null,
      due_date: form.due_date || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setEditing(null)
      toast.success('Updated')
    },
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', description: '', organization_id: orgFilter, status: 'todo', priority: '', due_date: '' })
    setFormOpen(true)
  }

  const openEdit = (t: Task) => {
    setEditing(t)
    setForm({
      title: t.title,
      description: t.description || '',
      organization_id: t.organization_id || '',
      status: t.status,
      priority: t.priority || '',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
    })
    setFormOpen(true)
  }

  const grouped = useMemo(() => {
    if (!groupByStatus) return null
    const buckets: Record<string, Task[]> = {}
    for (const t of roots) {
      buckets[t.status] = buckets[t.status] || []
      buckets[t.status].push(t)
    }
    return buckets
  }, [groupByStatus, roots])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-ink-faint mt-1">Projects, tasks, ideas — link to an organization or keep them floating.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />New
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-surface-raised border border-line rounded-lg">
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="text-sm bg-surface border border-line rounded px-2 py-1"
        >
          <option value="">All organizations</option>
          {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
          className="text-sm bg-surface border border-line rounded px-2 py-1"
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-ink-dim">
          <input type="checkbox" checked={groupByStatus} onChange={(e) => setGroupByStatus(e.target.checked)} />
          Group by status
        </label>

        <label className="flex items-center gap-1.5 text-sm text-ink-dim">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
      </div>

      {roots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-faint">
          <ListTodo className="h-12 w-12 mb-3" />
          <p>No tasks yet — create one to get started.</p>
        </div>
      ) : grouped ? (
        <div className="space-y-6">
          {STATUS_ORDER.map((s) => {
            const items = grouped[s] || []
            if (!items.length) return null
            const meta = STATUS_META[s]
            return (
              <div key={s}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <meta.icon className={`h-4 w-4 ${meta.color}`} />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-ink-faint">({items.length})</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((t) => (
                    <TaskNode key={t.id} task={t} depth={0} filterStatus={statusFilter} orgFilter={orgFilter} onEdit={openEdit} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-0.5">
          {roots.map((t) => (
            <TaskNode key={t.id} task={t} depth={0} filterStatus={statusFilter} orgFilter={orgFilter} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit task' : 'New task'}>
        <form
          onSubmit={(e) => { e.preventDefault(); editing ? updateMut.mutate() : createMut.mutate() }}
          className="space-y-4"
        >
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field"
              rows={4}
              placeholder="Notes, context, links..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="input-field"
              >
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority | '' })}
                className="input-field"
              >
                <option value="">—</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Organization</label>
              <select
                value={form.organization_id}
                onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
                className="input-field"
              >
                <option value="">— None —</option>
                {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createMut.isPending || updateMut.isPending}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

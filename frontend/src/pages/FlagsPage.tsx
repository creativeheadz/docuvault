import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFlags, deleteFlag } from '@/api/flags'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Flag as FlagIcon, Trash2 } from 'lucide-react'
import type { Flag } from '@/types'
import toast from 'react-hot-toast'

export default function FlagsPage() {
  const queryClient = useQueryClient()
  const { data: flags = [], isLoading } = useQuery({ queryKey: ['flags'], queryFn: () => getFlags() })

  const deleteMutation = useMutation({
    mutationFn: deleteFlag,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flags'] }); toast.success('Flag removed') },
  })

  const columns: Column<Flag>[] = [
    { key: 'flag_type', header: 'Type', render: (f) => (
      <Badge variant={f.flag_type === 'critical' ? 'danger' : f.flag_type === 'warning' ? 'warning' : 'info'}>{f.flag_type}</Badge>
    )},
    { key: 'entity_type', header: 'Entity', render: (f) => <span className="capitalize">{f.entity_type.replace('_', ' ')}</span> },
    { key: 'message', header: 'Message', render: (f) => f.message || '—' },
    { key: 'created_at', header: 'Created', render: (f) => new Date(f.created_at).toLocaleString() },
    { key: 'actions', header: '', className: 'w-16', render: (f) => (
      <button onClick={() => { if (confirm('Remove flag?')) deleteMutation.mutate(f.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
        <Trash2 className="h-4 w-4 text-red-400" />
      </button>
    )},
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Flags</h1>
      <div className="card">
        <DataTable columns={columns} data={flags} loading={isLoading} emptyMessage="No flags" emptyIcon={<FlagIcon className="h-12 w-12" />} />
      </div>
    </div>
  )
}

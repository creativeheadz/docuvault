import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Building2, Search } from 'lucide-react'
import type { Organization } from '@/types'

interface OrgListProps {
  onAdd: () => void
}

export function OrgList({ onAdd }: OrgListProps) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['organizations', page, search],
    queryFn: () => getOrganizations({ page, page_size: 25, search }),
  })

  const columns: Column<Organization>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (org) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary-600" />
          </div>
          <span className="font-medium text-gray-900 dark:text-white">{org.name}</span>
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (org) => <span className="text-gray-500 truncate max-w-xs block">{org.description || '—'}</span> },
    { key: 'website', header: 'Website', render: (org) => <span className="text-gray-500">{org.website || '—'}</span> },
    {
      key: 'created_at',
      header: 'Created',
      render: (org) => <span className="text-gray-500">{new Date(org.created_at).toLocaleDateString()}</span>,
    },
  ]

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input-field pl-9"
          />
        </div>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          New Organization
        </Button>
      </div>
      <div className="card">
        <DataTable
          columns={columns}
          data={data?.items || []}
          loading={isLoading}
          page={page}
          totalPages={totalPages}
          total={data?.total || 0}
          onPageChange={setPage}
          onRowClick={(org) => navigate(`/organizations/${org.id}`)}
          emptyMessage="No organizations yet"
          emptyIcon={<Building2 className="h-12 w-12" />}
        />
      </div>
    </div>
  )
}

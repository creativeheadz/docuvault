import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  page?: number
  totalPages?: number
  total?: number
  onPageChange?: (page: number) => void
  onRowClick?: (item: T) => void
  emptyMessage?: string
  emptyIcon?: ReactNode
}

export function DataTable<T extends { id: string }>({
  columns, data, loading, page = 1, totalPages = 1, total = 0, onPageChange, onRowClick, emptyMessage = 'No data found', emptyIcon,
}: DataTableProps<T>) {
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!data.length) return <EmptyState message={emptyMessage} icon={emptyIcon} />

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <th key={col.key} className={cn('text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={item.id}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'border-b border-gray-100 dark:border-gray-700/50 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('py-3 px-4', col.className)}>
                    {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4">
          <span className="text-sm text-gray-500">{total} total</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

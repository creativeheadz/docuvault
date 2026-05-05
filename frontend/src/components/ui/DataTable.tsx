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
  /** Tabular numerics — right-align numeric columns by convention. */
  numeric?: boolean
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
  columns, data, loading, page = 1, totalPages = 1, total = 0, onPageChange, onRowClick, emptyMessage = 'No records', emptyIcon,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner caption="Loading" />
      </div>
    )
  }
  if (!data.length) return <EmptyState message={emptyMessage} icon={emptyIcon} />

  return (
    <div className="surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'text-left py-3 px-4 font-mono font-medium uppercase tracking-button text-xxs text-ink-faint',
                    col.numeric && 'text-right',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr
                key={item.id}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'border-b border-line/60 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface-sunken',
                  i === data.length - 1 && 'border-b-0'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'py-2.5 px-4 text-sm text-ink',
                      col.numeric && 'text-right tnum-mono',
                      col.className
                    )}
                  >
                    {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-surface">
          <span className="font-mono text-xxs uppercase tracking-button text-ink-faint">
            <span className="tnum-mono text-ink">{total}</span> total
          </span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="font-mono text-xxs uppercase tracking-button text-ink-dim">
              <span className="tnum-mono text-ink">{page}</span> / <span className="tnum-mono">{totalPages}</span>
            </span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

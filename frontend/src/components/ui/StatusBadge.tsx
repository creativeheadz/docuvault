import { Badge } from './Badge'

interface StatusBadgeProps {
  date: string | null
  warningDays?: number
}

export function StatusBadge({ date, warningDays = 30 }: StatusBadgeProps) {
  if (!date) return <Badge variant="default">N/A</Badge>

  const exp = new Date(date)
  const now = new Date()
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return <Badge variant="danger">Expired</Badge>
  if (diffDays <= warningDays) return <Badge variant="warning">Expiring Soon</Badge>
  return <Badge variant="success">Active</Badge>
}

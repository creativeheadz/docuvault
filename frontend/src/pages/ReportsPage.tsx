import { useQuery } from '@tanstack/react-query'
import { getCoverageReport, getActivityReport } from '@/api/reports'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { BarChart3, Building2, Server, KeyRound, FileText, Globe, ShieldCheck, Users, MapPin, CheckSquare, BookOpen } from 'lucide-react'

const entityIcons: Record<string, typeof Building2> = {
  organizations: Building2, configurations: Server, passwords: KeyRound, documents: FileText,
  domains: Globe, ssl_certificates: ShieldCheck, contacts: Users, locations: MapPin,
  checklists: CheckSquare, runbooks: BookOpen,
}

const entityColors: Record<string, string> = {
  organizations: 'bg-blue-500', configurations: 'bg-purple-500', passwords: 'bg-red-500',
  documents: 'bg-green-500', domains: 'bg-orange-500', ssl_certificates: 'bg-teal-500',
  contacts: 'bg-pink-500', locations: 'bg-indigo-500', checklists: 'bg-yellow-500', runbooks: 'bg-cyan-500',
}

export default function ReportsPage() {
  const { data: coverage, isLoading: coverageLoading } = useQuery({ queryKey: ['reports', 'coverage'], queryFn: getCoverageReport })
  const { data: activity = [], isLoading: activityLoading } = useQuery({ queryKey: ['reports', 'activity'], queryFn: () => getActivityReport(20) })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Reports</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Documentation Coverage</CardTitle>
          </CardHeader>
          {coverageLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : coverage ? (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {Object.entries(coverage.counts).map(([key, count]) => {
                  const Icon = entityIcons[key] || BarChart3
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <div className={`h-8 w-8 rounded-lg ${entityColors[key] || 'bg-gray-500'} flex items-center justify-center`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="text-lg font-bold">{count}</div>
                        <div className="text-xs text-gray-500 capitalize">{key.replace('_', ' ')}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="text-center p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                <div className="text-3xl font-bold text-primary-600">{coverage.total}</div>
                <div className="text-sm text-primary-500">Total Items Documented</div>
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          {activityLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {activity.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
                  <Badge variant={entry.action === 'create' ? 'success' : entry.action === 'delete' ? 'danger' : 'info'}>
                    {entry.action}
                  </Badge>
                  <span className="capitalize text-gray-500">{entry.entity_type?.replace('_', ' ')}</span>
                  <span className="text-xs text-gray-400 ml-auto">{new Date(entry.created_at).toLocaleString()}</span>
                </div>
              ))}
              {!activity.length && <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

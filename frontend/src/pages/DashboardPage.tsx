import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { useAuthStore } from '@/store/authStore'
import { getOrganizations } from '@/api/organizations'
import { Building2, Server, KeyRound, FileText, Globe, ShieldCheck, Users, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 5 }),
  })

  const quickLinks = [
    { label: 'Organizations', icon: Building2, path: '/organizations', color: 'bg-blue-500' },
    { label: 'Configurations', icon: Server, path: '/configurations', color: 'bg-purple-500' },
    { label: 'Passwords', icon: KeyRound, path: '/passwords', color: 'bg-red-500' },
    { label: 'Documents', icon: FileText, path: '/documents', color: 'bg-green-500' },
    { label: 'Domains', icon: Globe, path: '/domains', color: 'bg-orange-500' },
    { label: 'SSL Certs', icon: ShieldCheck, path: '/ssl-certificates', color: 'bg-teal-500' },
    { label: 'Contacts', icon: Users, path: '/contacts', color: 'bg-pink-500' },
    { label: 'Locations', icon: MapPin, path: '/locations', color: 'bg-indigo-500' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.full_name || user?.username}
        </h1>
        <p className="text-gray-500 mt-1">Here's your IT documentation overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {quickLinks.map((item) => (
          <Link key={item.path} to={item.path}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${item.color} flex items-center justify-center`}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <span className="font-medium text-gray-900 dark:text-white">{item.label}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Organizations</CardTitle>
        </CardHeader>
        {orgs?.items.length ? (
          <div className="space-y-2">
            {orgs.items.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary-600" />
                </div>
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{org.name}</span>
                  {org.description && <p className="text-xs text-gray-500 truncate max-w-md">{org.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No organizations yet. Create your first one to get started.</p>
        )}
      </Card>
    </div>
  )
}

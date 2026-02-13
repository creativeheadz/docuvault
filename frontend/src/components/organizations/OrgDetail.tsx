import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getOrganization, deleteOrganization } from '@/api/organizations'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, Pencil, Trash2, Globe, Phone, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

interface OrgDetailProps {
  onEdit: (org: import('@/types').Organization) => void
}

export function OrgDetail({ onEdit }: OrgDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: org, isLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => getOrganization(id!),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrganization(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organization deleted')
      navigate('/organizations')
    },
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!org) return <div className="text-center py-12">Organization not found</div>

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/organizations')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => onEdit(org)}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
        <Button variant="danger" size="sm" onClick={() => { if (confirm('Delete this organization?')) deleteMutation.mutate() }}>
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      <Card>
        <div className="flex items-start gap-4 mb-6">
          <div className="h-16 w-16 rounded-xl bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-600">{org.name[0]}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{org.name}</h1>
            {org.description && <p className="text-gray-500 mt-1">{org.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {org.website && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-gray-400" />
              <a href={org.website} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{org.website}</a>
            </div>
          )}
          {org.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>{org.phone}</span>
            </div>
          )}
          {org.address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>{org.address}</span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 flex gap-4 text-xs text-gray-400">
          <span>Created: {new Date(org.created_at).toLocaleString()}</span>
          <span>Updated: {new Date(org.updated_at).toLocaleString()}</span>
        </div>
      </Card>
    </div>
  )
}

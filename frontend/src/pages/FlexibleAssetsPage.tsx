import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFlexibleAssetTypes, createFlexibleAssetType, deleteFlexibleAssetType, getFlexibleAssets, createFlexibleAsset, deleteFlexibleAsset } from '@/api/flexibleAssets'
import { getOrganizations } from '@/api/organizations'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Puzzle, Plus, Trash2, Settings } from 'lucide-react'
import type { FlexibleAssetType, FlexibleAsset } from '@/types'
import toast from 'react-hot-toast'

export default function FlexibleAssetsPage() {
  const queryClient = useQueryClient()
  const [selectedType, setSelectedType] = useState<FlexibleAssetType | null>(null)
  const [typeFormOpen, setTypeFormOpen] = useState(false)
  const [assetFormOpen, setAssetFormOpen] = useState(false)
  const [typeName, setTypeName] = useState('')
  const [typeDescription, setTypeDescription] = useState('')
  const [assetForm, setAssetForm] = useState<Record<string, unknown>>({ name: '', organization_id: '', field_values: {} })

  const { data: types = [] } = useQuery({ queryKey: ['flexible-asset-types'], queryFn: getFlexibleAssetTypes })
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['flexible-assets', selectedType?.id],
    queryFn: () => getFlexibleAssets({ asset_type_id: selectedType!.id }),
    enabled: !!selectedType,
  })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const createTypeMutation = useMutation({
    mutationFn: () => createFlexibleAssetType({ name: typeName, description: typeDescription }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flexible-asset-types'] }); toast.success('Type created'); setTypeFormOpen(false); setTypeName(''); setTypeDescription('') },
  })

  const deleteTypeMutation = useMutation({
    mutationFn: deleteFlexibleAssetType,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flexible-asset-types'] }); setSelectedType(null); toast.success('Deleted') },
  })

  const createAssetMutation = useMutation({
    mutationFn: () => createFlexibleAsset({ ...assetForm, asset_type_id: selectedType!.id }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flexible-assets'] }); toast.success('Asset created'); setAssetFormOpen(false) },
  })

  const deleteAssetMutation = useMutation({
    mutationFn: deleteFlexibleAsset,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['flexible-assets'] }); toast.success('Deleted') },
  })

  const columns: Column<FlexibleAsset>[] = [
    { key: 'name', header: 'Name', render: (i) => <span className="font-medium">{i.name}</span> },
    { key: 'created_at', header: 'Created', render: (i) => new Date(i.created_at).toLocaleDateString() },
    { key: 'actions', header: '', className: 'w-16', render: (i) => (
      <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteAssetMutation.mutate(i.id) }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
        <Trash2 className="h-4 w-4 text-red-400" />
      </button>
    )},
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Flexible Assets</h1>
        <Button onClick={() => setTypeFormOpen(true)}><Plus className="h-4 w-4 mr-2" />New Asset Type</Button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">Asset Types</h3>
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedType(t)}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${selectedType?.id === t.id ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-primary-500" />
                <span className="text-sm font-medium">{t.name}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete type?')) deleteTypeMutation.mutate(t.id) }} className="p-1 opacity-0 group-hover:opacity-100">
                <Trash2 className="h-3 w-3 text-gray-400" />
              </button>
            </button>
          ))}
          {!types.length && <p className="text-sm text-gray-400">No asset types yet</p>}
        </div>

        <div className="col-span-3">
          {selectedType ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{selectedType.name}</h2>
                  {selectedType.description && <p className="text-sm text-gray-500">{selectedType.description}</p>}
                </div>
                <Button onClick={() => { setAssetForm({ name: '', organization_id: '', field_values: {} }); setAssetFormOpen(true) }}>
                  <Plus className="h-4 w-4 mr-2" />New {selectedType.name}
                </Button>
              </div>
              <div className="card">
                <DataTable columns={columns} data={assets} loading={isLoading} emptyMessage={`No ${selectedType.name} assets`} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Puzzle className="h-12 w-12 mb-3" />
              <p>Select an asset type to view assets</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={typeFormOpen} onClose={() => setTypeFormOpen(false)} title="New Asset Type">
        <form onSubmit={(e) => { e.preventDefault(); createTypeMutation.mutate() }} className="space-y-4">
          <Input label="Name" value={typeName} onChange={(e) => setTypeName(e.target.value)} required placeholder="e.g., Active Directory" />
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={typeDescription} onChange={(e) => setTypeDescription(e.target.value)} className="input-field" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setTypeFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createTypeMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={assetFormOpen} onClose={() => setAssetFormOpen(false)} title={`New ${selectedType?.name || 'Asset'}`} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); createAssetMutation.mutate() }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization</label>
            <select value={assetForm.organization_id as string} onChange={(e) => setAssetForm({ ...assetForm, organization_id: e.target.value })} className="input-field" required>
              <option value="">Select...</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <Input label="Name" value={assetForm.name as string} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} required />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setAssetFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createAssetMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

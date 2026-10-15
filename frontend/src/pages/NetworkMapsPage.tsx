import '@/components/network-map/networkMap.css'

import { useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ArrowRight, Network, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { createNetworkMap, deleteNetworkMap, getNetworkMaps } from '@/api/network-maps'
import { getOrganizations } from '@/api/organizations'
import { getLocations } from '@/api/locations'
import { MapThumbnail } from '@/components/network-map/MapThumbnail'
import { NetworkMapEditor } from '@/components/network-map/NetworkMapEditor'

function MapList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [orgFilter, setOrgFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ organization_id: '', name: '', location_id: '', description: '' })

  const { data: maps = [], isLoading } = useQuery({
    queryKey: ['network-maps', orgFilter],
    queryFn: () => getNetworkMaps(orgFilter ? { organization_id: orgFilter } : undefined),
  })
  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', form.organization_id],
    queryFn: () => getLocations({ organization_id: form.organization_id }),
    enabled: !!form.organization_id,
  })

  const byOrg = useMemo(() => {
    const groups = new Map<string, typeof maps>()
    for (const m of maps) groups.set(m.organization_name ?? '—', [...(groups.get(m.organization_name ?? '—') ?? []), m])
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [maps])

  const create = useMutation({
    mutationFn: () => createNetworkMap({
      organization_id: form.organization_id,
      name: form.name.trim(),
      location_id: form.location_id || null,
      description: form.description.trim() || null,
    }),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['network-maps'] })
      setOpen(false)
      setForm({ organization_id: '', name: '', location_id: '', description: '' })
      navigate(`/network-maps/${m.id}`)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not create the map'),
  })

  const remove = useMutation({
    mutationFn: deleteNetworkMap,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['network-maps'] }); toast.success('Map deleted') },
  })

  const openNew = () => {
    setForm((f) => ({ ...f, organization_id: f.organization_id || orgFilter }))
    setOpen(true)
  }

  return (
    <div>
      <div className="section-header">
        <div className="flex items-baseline gap-3">
          <span className="kicker text-ink-faint">§ Topology</span>
          <h1 className="text-3xl font-serif italic" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380' }}>
            Network maps.
          </h1>
          <span className="text-xxs font-mono text-ink-faint uppercase tracking-button">{maps.length} drawn</span>
        </div>
        <div className="flex items-center gap-2">
          <select className="input-field w-56" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
            <option value="">Every organisation</option>
            {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Button onClick={openNew}><Plus className="h-3.5 w-3.5" /> New map</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : maps.length === 0 ? (
        <div className="empty-instrument">
          <Network className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--ink-faint)' }} />
          <div className="kicker mb-2">§ A blank sheet</div>
          <p className="font-mono text-xs max-w-md mx-auto" style={{ color: 'var(--ink-faint)' }}>
            Draw how a site's network hangs together: the gateway first, then everything that plugs into it,
            each device tied to its system so the map shows what is up, what is down and what needs patching.
          </p>
          <Button className="mt-6" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Draw the first one</Button>
        </div>
      ) : (
        <div className="space-y-8">
          {byOrg.map(([org, list]) => (
            <section key={org}>
              {!orgFilter && <div className="kicker text-ink-faint mb-3">{org}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {list.map((m) => (
                  <Link key={m.id} to={`/network-maps/${m.id}`} className="group block">
                    <div className="card-instrument h-full flex flex-col gap-3 !p-0">
                      <MapThumbnail preview={m.preview} />
                      <div className="px-5 pb-5 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="kicker text-ink-faint truncate">{m.location_name ?? 'Whole organisation'}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="p-1 -m-1 opacity-0 group-hover:opacity-100 transition text-ink-faint hover:text-bad"
                              title="Delete this map"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (confirm(`Delete “${m.name}”? The systems on it are not affected.`)) remove.mutate(m.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--ember)' }} />
                          </div>
                        </div>
                        <h3 className="font-serif italic text-xl leading-tight m-0" style={{ color: 'var(--ink)', fontVariationSettings: '"opsz" 144, "SOFT" 60, "wght" 400' }}>
                          {m.name}
                        </h3>
                        {m.description && <p className="text-xs text-ink-dim m-0 line-clamp-2">{m.description}</p>}
                        <div className="flex items-center gap-4 mt-1 font-mono text-xxs uppercase tracking-button text-ink-faint tnum">
                          <span><b className="text-ink font-medium">{m.node_count}</b> devices</span>
                          <span><b className="text-ink font-medium">{m.link_count}</b> links</span>
                          <span><b className="text-ink font-medium">{m.record_count}</b> systems</span>
                          <span className="ml-auto normal-case tracking-normal">{formatDistanceToNow(new Date(m.updated_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New network map" size="md">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-4">
          <label className="block">
            <span className="label-micro">Organisation</span>
            <select
              className="input-field"
              value={form.organization_id}
              onChange={(e) => setForm({ ...form, organization_id: e.target.value, location_id: '' })}
              required
            >
              <option value="">Choose…</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Head office LAN"
            required
            maxLength={200}
          />
          <label className="block">
            <span className="label-micro">Site</span>
            <select
              className="input-field"
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              disabled={!form.organization_id}
            >
              <option value="">Whole organisation</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label-micro">Description</span>
            <textarea
              className="input-field"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this map covers"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!form.organization_id || !form.name.trim()}>
              Start drawing
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function MapEditorRoute() {
  const { id } = useParams<{ id: string }>()
  return <NetworkMapEditor key={id} mapId={id!} />
}

export default function NetworkMapsPage() {
  return (
    <Routes>
      <Route index element={<MapList />} />
      <Route path=":id" element={<MapEditorRoute />} />
    </Routes>
  )
}

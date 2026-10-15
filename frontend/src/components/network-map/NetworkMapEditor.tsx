import '@xyflow/react/dist/base.css'
import './networkMap.css'

import {
  useCallback, useEffect, useMemo, useReducer, useRef, useState, type DragEvent, type MutableRefObject,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background, BackgroundVariant, ConnectionMode, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, useStore,
  type Connection, type IsValidConnection, type OnBeforeDelete, type XYPosition,
} from '@xyflow/react'
import {
  ArrowLeft, Expand, Focus, Globe, LayoutGrid, Redo2, Shrink, SquareDashed, Undo2, Waves, Wand2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import { getNetworkMap, saveNetworkMapGraph, updateNetworkMap } from '@/api/network-maps'
import { getUptimeMonitors } from '@/api/uptime'
import { getLocations } from '@/api/locations'
import { createSystem } from '@/api/systems'
import { Spinner } from '@/components/ui/Spinner'
import type { DeviceRole, LinkRole, MapRecord, NetworkMapDetail, NodeKind } from '@/types'
import { NODE_KINDS, inferKind, inferLinkKind, nodeName } from './catalogue'
import { DeviceNodeView } from './DeviceNodeView'
import { ZoneNodeView } from './ZoneNodeView'
import { DraftConnection, LinkEdgeView } from './LinkEdgeView'
import { Inspector, type MapMeta } from './Inspector'
import { Palette } from './Palette'
import { DEVICE_H, DEVICE_W, childSlot, contains, layoutTree, wrap, type Rect } from './layout'
import {
  DND_TYPE, MapViewContext, downstream, gatewayMap, isDevice, isZone, newId, toDeviceNode,
  toGraph, toLinkEdge, toZoneNode, upstream, wouldLoop,
  type DeviceData, type DeviceNode, type DragPayload, type LinkData, type LinkEdge, type MapFlowNode,
  type MapView, type ZoneData, type ZoneNode,
} from './model'
import { indexMonitors, liveFor, type Live } from './status'

const nodeTypes = { device: DeviceNodeView, zone: ZoneNodeView }
const edgeTypes = { link: LinkEdgeView }

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'
type Snapshot = { nodes: MapFlowNode[]; edges: LinkEdge[] }
type Target = { x: number; y: number; width?: number; height?: number }

const signatureOf = (nodes: MapFlowNode[], edges: LinkEdge[]) => JSON.stringify(toGraph(nodes, edges))

const sizeOf = (n: MapFlowNode) => ({
  w: n.width ?? n.measured?.width ?? (isZone(n) ? 400 : DEVICE_W),
  h: n.height ?? n.measured?.height ?? (isZone(n) ? 260 : DEVICE_H),
})

const rectOf = (n: MapFlowNode): Rect => {
  const { w, h } = sizeOf(n)
  return { x: n.position.x, y: n.position.y, width: w, height: h }
}

function makeLink(source: string, target: string, role: LinkRole, kind: LinkData['kind'], selected = false): LinkEdge {
  return {
    id: newId(), type: 'link', source, target, selected,
    data: { role, kind, label: null, source_port: null, target_port: null, speed: null, vlan: null, notes: null },
  }
}

/** Turn a link round so `from` is its source, swapping the port names with it. */
function orient(e: LinkEdge, from: string, role: LinkRole): LinkEdge {
  if (e.source === from) return { ...e, data: { ...e.data!, role } }
  return {
    ...e, source: e.target, target: e.source,
    data: { ...e.data!, role, source_port: e.data!.target_port, target_port: e.data!.source_port },
  }
}

/** Parallel links between the same two devices get a lane each so they don't draw on top of one another. */
function withLanes(edges: LinkEdge[]): LinkEdge[] {
  const groups = new Map<string, LinkEdge[]>()
  for (const e of edges) {
    const key = [e.source, e.target].sort().join('|')
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  if ([...groups.values()].every((g) => g.length === 1)) return edges
  return edges.map((e) => {
    const g = groups.get([e.source, e.target].sort().join('|'))!
    if (g.length === 1) return e
    return { ...e, data: { ...e.data!, lane: g.indexOf(e), lanes: g.length } }
  })
}

const deselected = <T extends { selected?: boolean }>(xs: T[]) => xs.map((x) => (x.selected ? { ...x, selected: false } : x))

const errorDetail = (err: unknown): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message)
  return 'Something went wrong'
}

// ── loading ──────────────────────────────────────────────────────────────

export function NetworkMapEditor({ mapId }: { mapId: string }) {
  const query = useQuery({
    queryKey: ['network-map', mapId],
    queryFn: () => getNetworkMap(mapId),
    // Records' live state (agents online, new records) refreshes; the
    // drawing itself is only ever read once per editor.
    refetchInterval: 60_000,
  })
  const [initial, setInitial] = useState<NetworkMapDetail | null>(null)
  const [generation, setGeneration] = useState(0)
  useEffect(() => { if (query.data && !initial) setInitial(query.data) }, [query.data, initial])

  const reload = useCallback(async () => {
    const fresh = await query.refetch()
    if (fresh.data) { setInitial(fresh.data); setGeneration((g) => g + 1) }
  }, [query])

  if (query.error && !initial) {
    return (
      <div className="empty-instrument mt-10">
        <h3 className="font-serif italic text-xl m-0">This map could not be opened</h3>
        <p className="mt-2 text-xs text-ink-dim">{errorDetail(query.error)}</p>
        <Link to="/network-maps" className="btn-base btn-secondary mt-6">Back to maps</Link>
      </div>
    )
  }
  if (!initial) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>

  return (
    <ReactFlowProvider key={generation}>
      <Canvas
        initial={initial}
        records={query.data?.records ?? initial.records}
        refreshRecords={async () => { await query.refetch() }}
        reload={reload}
      />
    </ReactFlowProvider>
  )
}

// ── the editor ───────────────────────────────────────────────────────────

function Canvas({
  initial, records: fetchedRecords, refreshRecords, reload,
}: {
  initial: NetworkMapDetail
  records: MapRecord[]
  refreshRecords: () => Promise<void>
  reload: () => Promise<void>
}) {
  const rf = useReactFlow<MapFlowNode, LinkEdge>()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)

  const [startNodes] = useState<MapFlowNode[]>(() => [...initial.zones.map(toZoneNode), ...initial.nodes.map(toDeviceNode)])
  const [startEdges] = useState<LinkEdge[]>(() => initial.links.map(toLinkEdge))
  const [nodes, setNodes, onNodesChange] = useNodesState<MapFlowNode>(startNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<LinkEdge>(startEdges)

  const [meta, setMeta] = useState<MapMeta>({
    name: initial.name, description: initial.description, location_id: initial.location_id,
    organization_id: initial.organization_id, organization_name: initial.organization_name,
  })
  const [locationName, setLocationName] = useState(initial.location_name)
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [showFlow, setShowFlow] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null)
  const [far, setFar] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── records & live state ───────────────────────────────────────────────
  // Records made from this editor show at once, without waiting for the
  // next read of the map to include them.
  const [created, setCreated] = useState<MapRecord[]>([])
  const allRecords = useMemo(() => {
    const known = new Set(fetchedRecords.map((r) => r.id))
    return [...fetchedRecords, ...created.filter((r) => !known.has(r.id))]
  }, [fetchedRecords, created])
  const recordList = allRecords
  const records = useMemo(() => new Map(recordList.map((r) => [r.id, r])), [recordList])
  const devices = useMemo(() => nodes.filter(isDevice), [nodes])
  // Keys that change when what a device *is* changes, not when it moves,
  // so dragging doesn't recompute (and redraw) every plate on the map.
  const identityKey = devices.map((d) => `${d.id}:${d.data.system_id}:${d.data.address}:${d.data.label}`).join('|')
  const placedKey = devices.map((d) => d.data.system_id ?? '').join('|')
  const unplaced = useMemo(() => {
    const placed = new Set(placedKey.split('|'))
    return recordList.filter((r) => !r.archived && !placed.has(r.id))
  }, [recordList, placedKey])

  const uptime = useQuery({ queryKey: ['uptime', 'monitors'], queryFn: () => getUptimeMonitors(), refetchInterval: 60_000 })
  const monitors = useMemo(() => indexMonitors(uptime.data?.monitors ?? []), [uptime.data])
  const live = useMemo(() => {
    const m = new Map<string, Live>()
    for (const d of devices) {
      m.set(d.id, liveFor(d.data.system_id ? records.get(d.data.system_id) : undefined, d.data.address, d.data.label, monitors))
    }
    return m
  }, [identityKey, records, monitors])

  const locations = useQuery({
    queryKey: ['locations', meta.organization_id],
    queryFn: () => getLocations({ organization_id: meta.organization_id }),
  })

  // ── the tree ───────────────────────────────────────────────────────────
  const gateways = useMemo(() => gatewayMap(edges), [edges])
  const childCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const parent of gateways.values()) m.set(parent, (m.get(parent) ?? 0) + 1)
    return m
  }, [gateways])
  const descendants = useCallback((id: string) => downstream(id, gateways), [gateways])

  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const selectedEdges = useMemo(() => edges.filter((e) => e.selected), [edges])
  const soleDevice = selectedNodes.length === 1 && selectedEdges.length === 0 && isDevice(selectedNodes[0]) ? selectedNodes[0] : null
  const soleDeviceId = soleDevice?.id ?? null

  const { pathNodes, pathEdges } = useMemo(() => {
    if (!soleDeviceId) return { pathNodes: new Set<string>(), pathEdges: new Set<string>() }
    const chain = [soleDeviceId, ...upstream(soleDeviceId, gateways)]
    const uplinkOf = new Map(edges.filter((e) => e.data?.role === 'uplink').map((e) => [e.source, e.id]))
    return {
      pathNodes: new Set(chain),
      pathEdges: new Set(chain.map((id) => uplinkOf.get(id)).filter(Boolean) as string[]),
    }
  }, [soleDeviceId, gateways, edges])

  // ── undo ───────────────────────────────────────────────────────────────
  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  const [, bumpHistory] = useReducer((x: number) => x + 1, 0)

  const checkpoint = useCallback(() => {
    past.current.push({ nodes: rf.getNodes(), edges: rf.getEdges() })
    if (past.current.length > 80) past.current.shift()
    future.current = []
    bumpHistory()
  }, [rf])

  const restore = useCallback((s: Snapshot) => {
    setNodes(s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)))
    setEdges(s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)))
  }, [setNodes, setEdges])

  const step = useCallback((from: MutableRefObject<Snapshot[]>, to: MutableRefObject<Snapshot[]>) => {
    const now = { nodes: rf.getNodes(), edges: rf.getEdges() }
    const nowSig = signatureOf(now.nodes, now.edges)
    let snap: Snapshot | undefined
    // Skip points where nothing actually changed (a field focused, then left).
    while ((snap = from.current.pop())) if (signatureOf(snap.nodes, snap.edges) !== nowSig) break
    if (snap) { to.current.push(now); restore(snap) }
    bumpHistory()
  }, [rf, restore])
  const undo = useCallback(() => step(past, future), [step])
  const redo = useCallback(() => step(future, past), [step])

  // ── saving ─────────────────────────────────────────────────────────────
  const versionRef = useRef(initial.version)
  const lastSaved = useRef(signatureOf(startNodes, startEdges))
  const saving = useRef(false)
  const again = useRef(false)
  const conflictRef = useRef(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [savedAt, setSavedAt] = useState(initial.updated_at)
  const [serverVersion, setServerVersion] = useState<number | null>(null)

  const flush = useCallback(async () => {
    if (conflictRef.current) return
    if (saving.current) { again.current = true; return }
    const graph = toGraph(rf.getNodes(), rf.getEdges())
    const sig = JSON.stringify(graph)
    if (sig === lastSaved.current) { setSaveState('saved'); return }
    saving.current = true
    setSaveState('saving')
    try {
      const res = await saveNetworkMapGraph(initial.id, { ...graph, version: versionRef.current, viewport: rf.getViewport() })
      versionRef.current = res.version
      lastSaved.current = sig
      setSavedAt(res.updated_at)
      queryClient.invalidateQueries({ queryKey: ['network-maps'] })
      setSaveState(signatureOf(rf.getNodes(), rf.getEdges()) === sig ? 'saved' : 'dirty')
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: { detail?: { version?: number } } } }).response
      if (res?.status === 409) {
        conflictRef.current = true
        setServerVersion(res.data?.detail?.version ?? null)
        setSaveState('conflict')
      } else {
        setSaveState('error')
        toast.error(`Not saved: ${errorDetail(err)}`)
      }
    } finally {
      saving.current = false
      if (again.current) { again.current = false; void flush() }
    }
  }, [rf, initial.id, queryClient])

  const signature = useMemo(() => signatureOf(nodes, edges), [nodes, edges])
  useEffect(() => {
    if (conflictRef.current || signature === lastSaved.current) return
    setSaveState((s) => (s === 'saving' ? s : 'dirty'))
    const t = window.setTimeout(() => void flush(), 900)
    return () => window.clearTimeout(t)
  }, [signature, flush])

  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => { void flushRef.current() }, [])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (signatureOf(rf.getNodes(), rf.getEdges()) !== lastSaved.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [rf])

  const overwrite = () => {
    if (serverVersion == null) return
    versionRef.current = serverVersion
    conflictRef.current = false
    setServerVersion(null)
    void flush()
  }

  // ── helpers that change the drawing ────────────────────────────────────
  const viewportCentre = useCallback((): XYPosition => {
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    // Nudge repeated adds apart instead of stacking them exactly.
    const crowd = rf.getNodes().filter((n) => Math.abs(n.position.x + DEVICE_W / 2 - p.x) < 40 && Math.abs(n.position.y + DEVICE_H / 2 - p.y) < 40).length
    return { x: p.x + crowd * 24, y: p.y + crowd * 24 }
  }, [rf])

  const addDevice = useCallback((opts: { kind: NodeKind; record?: MapRecord; at?: XYPosition; gateway?: string }) => {
    checkpoint()
    const id = newId()
    const at = opts.at ?? viewportCentre()
    let position = { x: at.x - DEVICE_W / 2, y: at.y - DEVICE_H / 2 }
    let link: LinkEdge | null = null
    const gw = opts.gateway ? rf.getNode(opts.gateway) : undefined
    if (gw && isDevice(gw)) {
      const gws = gatewayMap(rf.getEdges())
      const siblings = [...gws].filter(([, p]) => p === gw.id).map(([c]) => rf.getNode(c)?.position).filter(Boolean) as XYPosition[]
      position = opts.at
        ? { x: opts.at.x - DEVICE_W / 2, y: gw.position.y + sizeOf(gw).h + 76 }
        : childSlot(gw.position, siblings)
      link = makeLink(id, gw.id, 'uplink', inferLinkKind(opts.kind, gw.data.kind))
    }
    const node: DeviceNode = {
      id, type: 'device', position, selected: true,
      data: { kind: opts.kind, label: null, address: null, functions: [], notes: null, system_id: opts.record?.id ?? null },
    }
    setNodes((ns) => [...deselected(ns), node])
    setEdges((es) => (link ? [...deselected(es), link] : deselected(es)))
    if (!opts.record) setAutoFocusId(id)
    return id
  }, [checkpoint, viewportCentre, rf, setNodes, setEdges])

  const addZone = useCallback((at?: XYPosition, rect?: Rect) => {
    checkpoint()
    const c = at ?? viewportCentre()
    const r = rect ?? { x: c.x - 220, y: c.y - 140, width: 440, height: 280 }
    const zone: ZoneNode = { ...toZoneNode({ id: newId(), label: 'Zone', tone: 'neutral', notes: null, ...r }), selected: true }
    setNodes((ns) => [zone, ...deselected(ns)])
    setEdges((es) => deselected(es))
    setAutoFocusId(zone.id)
  }, [checkpoint, viewportCentre, setNodes, setEdges])

  const arrangement = useCallback((ns: MapFlowNode[], es: LinkEdge[]): Map<string, Target> => {
    const devs = ns.filter(isDevice)
    const pos = layoutTree(
      devs.map((d) => ({ id: d.id, kind: d.data.kind, name: nodeName(d.data, d.data.system_id ? records.get(d.data.system_id) : undefined) })),
      es.map((e) => ({ source: e.source, target: e.target, role: e.data!.role })),
    )
    const out = new Map<string, Target>(pos)
    for (const z of ns.filter(isZone)) {
      const members = devs.filter((d) => contains(rectOf(z), d.position, sizeOf(d).w, sizeOf(d).h))
      if (members.length) out.set(z.id, wrap(members.map((m) => pos.get(m.id)!)))
    }
    return out
  }, [records])

  const animateTo = useCallback((targets: Map<string, Target>) => {
    const start = new Map(rf.getNodes().map((n) => [n.id, { ...n.position, ...(isZone(n) ? { width: sizeOf(n).w, height: sizeOf(n).h } : {}) }]))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    const frame = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - t0) / 560)
      const e = ease(k)
      const lerp = (a: number, b: number) => a + (b - a) * e
      setNodes((ns) => ns.map((n) => {
        const to = targets.get(n.id)
        const from = start.get(n.id)
        if (!to || !from) return n
        const next = { ...n, position: { x: lerp(from.x, to.x), y: lerp(from.y, to.y) } }
        if (to.width !== undefined && from.width !== undefined) {
          next.width = lerp(from.width, to.width)
          next.height = lerp(from.height!, to.height!)
        }
        return next
      }))
      if (k < 1) requestAnimationFrame(frame)
      else window.setTimeout(() => rf.fitView({ padding: 0.15, duration: 500, maxZoom: 1.1 }), 40)
    }
    requestAnimationFrame(frame)
  }, [rf, setNodes])

  const arrange = useCallback(() => {
    const ns = rf.getNodes()
    if (!ns.some(isDevice)) return
    checkpoint()
    animateTo(arrangement(ns, rf.getEdges()))
  }, [rf, checkpoint, animateTo, arrangement])

  const placeAll = useCallback(() => {
    if (!unplaced.length) return
    checkpoint()
    const added: DeviceNode[] = unplaced.map((r) => ({
      id: newId(), type: 'device', position: { x: 0, y: 0 },
      data: { kind: inferKind(r), label: null, address: null, functions: [], notes: null, system_id: r.id },
    }))
    const next = [...deselected(rf.getNodes()), ...added]
    const targets = arrangement(next, rf.getEdges())
    setNodes(next.map((n) => {
      const t = targets.get(n.id)
      return t ? { ...n, position: { x: t.x, y: t.y }, ...(isZone(n) && t.width ? { width: t.width, height: t.height } : {}) } : n
    }))
    window.setTimeout(() => rf.fitView({ padding: 0.15, duration: 600, maxZoom: 1.1 }), 80)
    toast.success(`Placed ${added.length} system${added.length === 1 ? '' : 's'}. Drag between devices to say what plugs into what.`)
  }, [unplaced, checkpoint, rf, arrangement, setNodes])

  const startFromTheTop = useCallback(() => {
    checkpoint()
    const c = viewportCentre()
    const wan: DeviceNode = {
      id: newId(), type: 'device', position: { x: c.x - DEVICE_W / 2, y: c.y - DEVICE_H - 40 },
      data: { kind: 'internet', label: null, address: null, functions: [], notes: null, system_id: null },
    }
    const fw: DeviceNode = {
      id: newId(), type: 'device', position: { x: c.x - DEVICE_W / 2, y: c.y + 20 }, selected: true,
      data: { kind: 'firewall', label: null, address: null, functions: ['Gateway', 'NAT'], notes: null, system_id: null },
    }
    setNodes((ns) => [...deselected(ns), wan, fw])
    setEdges((es) => [...deselected(es), makeLink(fw.id, wan.id, 'uplink', 'wan')])
    setAutoFocusId(fw.id)
  }, [checkpoint, viewportCentre, setNodes, setEdges])

  // ── connecting ─────────────────────────────────────────────────────────
  const isValidConnection: IsValidConnection<LinkEdge> = useCallback((c) => {
    if (!c.source || !c.target || c.source === c.target) return false
    const a = rf.getNode(c.source)
    const b = rf.getNode(c.target)
    return !!a && !!b && isDevice(a) && isDevice(b)
  }, [rf])

  const onConnect = useCallback((c: Connection) => {
    const a = rf.getNode(c.source)
    const b = rf.getNode(c.target)
    if (!a || !b || !isDevice(a) || !isDevice(b) || a.id === b.id) return
    checkpoint()
    const gws = gatewayMap(rf.getEdges())
    // The first connection out of a device names its gateway, unless that
    // would put the device above itself.
    const role: LinkRole = !gws.has(a.id) && !wouldLoop(a.id, b.id, gws) ? 'uplink' : 'peer'
    const link = makeLink(a.id, b.id, role, inferLinkKind(a.data.kind, b.data.kind), true)
    setNodes((ns) => deselected(ns))
    setEdges((es) => [...deselected(es), link])
  }, [rf, checkpoint, setNodes, setEdges])

  const onBeforeDelete: OnBeforeDelete<MapFlowNode, LinkEdge> = useCallback(async () => {
    checkpoint()
    return true
  }, [checkpoint])

  // ── dragging zones carries what's inside ───────────────────────────────
  const zoneDrag = useRef<{ id: string; from: XYPosition; members: Map<string, XYPosition> } | null>(null)

  const onNodeDragStart = useCallback((_: unknown, node: MapFlowNode) => {
    checkpoint()
    if (!isZone(node)) return
    const r = rectOf(node)
    const members = new Map<string, XYPosition>()
    for (const n of rf.getNodes()) {
      if (isDevice(n) && !n.selected && contains(r, n.position, sizeOf(n).w, sizeOf(n).h)) members.set(n.id, n.position)
    }
    zoneDrag.current = { id: node.id, from: node.position, members }
  }, [checkpoint, rf])

  const onNodeDrag = useCallback((_: unknown, node: MapFlowNode) => {
    const z = zoneDrag.current
    if (!z || z.id !== node.id || !z.members.size) return
    const dx = node.position.x - z.from.x
    const dy = node.position.y - z.from.y
    setNodes((ns) => ns.map((n) => {
      const p = z.members.get(n.id)
      return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n
    }))
  }, [setNodes])

  const onNodeDragStop = useCallback(() => { zoneDrag.current = null }, [])

  // ── dropping from the palette ──────────────────────────────────────────
  const deviceAt = useCallback((p: XYPosition): DeviceNode | null => {
    const hits = rf.getNodes().filter(isDevice).filter((n) => {
      const { w, h } = sizeOf(n)
      return p.x >= n.position.x && p.x <= n.position.x + w && p.y >= n.position.y && p.y <= n.position.y + h
    })
    return hits[hits.length - 1] ?? null
  }, [rf])

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const host = deviceAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    setDropTarget(host?.id ?? null)
  }

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(DND_TYPE)
    setDropTarget(null)
    if (!raw) return
    e.preventDefault()
    const payload = JSON.parse(raw) as DragPayload
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if ('zone' in payload) { addZone(at); return }
    const host = deviceAt(at)
    if ('record' in payload) {
      const record = records.get(payload.record)
      if (!record) return
      if (!unplaced.some((r) => r.id === record.id)) { toast.error(`${record.name} is already on this map`); return }
      addDevice({ kind: inferKind(record), record, at, gateway: host?.id })
    } else {
      addDevice({ kind: payload.kind, at, gateway: host?.id })
    }
  }

  // ── the inspector's tools ──────────────────────────────────────────────
  const updateDevice = useCallback((id: string, patch: Partial<DeviceData>) => {
    setNodes((ns) => ns.map((n) => (n.id === id && isDevice(n) ? { ...n, data: { ...n.data, ...patch } } : n)))
  }, [setNodes])

  const selectEdge = useCallback((id: string) => {
    setNodes((ns) => deselected(ns))
    setEdges((es) => es.map((e) => (e.selected === (e.id === id) ? e : { ...e, selected: e.id === id })))
  }, [setNodes, setEdges])

  const setGateway = useCallback((id: string, gw: string | null) => {
    const es = rf.getEdges()
    const current = es.find((e) => e.source === id && e.data?.role === 'uplink')
    if (gw === null) {
      if (current) setEdges(es.filter((e) => e !== current))
      return
    }
    if (current?.target === gw) return
    const others = es.filter((e) => e !== current)
    if (wouldLoop(id, gw, gatewayMap(others))) return toast.error('That device already sits below this one')
    const peer = others.find((e) => e.data?.role === 'peer' && ((e.source === id && e.target === gw) || (e.source === gw && e.target === id)))
    if (peer) return setEdges(others.map((e) => (e === peer ? orient(e, id, 'uplink') : e)))
    if (current) {
      // Re-plugged: the cable is the same, the port at the far end is not.
      return setEdges(es.map((e) => (e === current ? { ...e, target: gw, data: { ...e.data!, target_port: null } } : e)))
    }
    const me = rf.getNode(id)
    const them = rf.getNode(gw)
    if (!me || !them || !isDevice(me) || !isDevice(them)) return
    setEdges([...es, makeLink(id, gw, 'uplink', inferLinkKind(me.data.kind, them.data.kind))])
  }, [rf, setEdges])

  const linkRecord = useCallback((id: string, recordId: string | null) => {
    const n = rf.getNode(id)
    if (!n || !isDevice(n)) return
    if (recordId === null) {
      const was = n.data.system_id ? records.get(n.data.system_id) : undefined
      updateDevice(id, { system_id: null, label: n.data.label || was?.name || null })
      return
    }
    const r = records.get(recordId)
    updateDevice(id, {
      system_id: recordId,
      ...(r && n.data.kind === 'other' ? { kind: inferKind(r) } : {}),
    })
  }, [rf, records, updateDevice])

  const promote = useCallback(async (id: string) => {
    const n = rf.getNode(id)
    if (!n || !isDevice(n)) return
    const kind = NODE_KINDS[n.data.kind]
    const address = n.data.address?.trim() || null
    const isIp = !!address && /^\d{1,3}(\.\d{1,3}){3}$/.test(address)
    const role: DeviceRole | null = kind.tier === 'compute' ? 'server' : kind.tier === 'edge' || kind.tier === 'fabric' ? 'network' : null
    try {
      const cfg = await createSystem({
        organization_id: meta.organization_id,
        name: n.data.label?.trim() || kind.label,
        category: kind.label,
        ip_address: isIp ? address : null,
        hostname: !isIp && address && !address.includes('/') ? address : null,
        device_role: role,
        body: n.data.notes,
        source: 'map',
      })
      setCreated((c) => [...c, {
        ...cfg,
        mesh_last_sync_at: cfg.mesh_last_sync_at ?? null,
        archived: false,
        firewall_rules: [],
      }])
      void refreshRecords()
      queryClient.invalidateQueries({ queryKey: ['systems'] })
      checkpoint()
      updateDevice(id, { system_id: cfg.id, label: null, ...(isIp ? { address: null } : {}) })
      toast.success(`System created: ${cfg.name}`)
    } catch (err) {
      toast.error(errorDetail(err))
    }
  }, [rf, meta.organization_id, refreshRecords, queryClient, checkpoint, updateDevice])

  const updateLink = useCallback((id: string, patch: Partial<LinkData>) => {
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e)))
  }, [setEdges])

  const setRole = useCallback((id: string, role: LinkRole) => {
    const es = rf.getEdges()
    const link = es.find((e) => e.id === id)
    if (!link) return
    if (role === 'peer') return setEdges(es.map((e) => (e === link ? orient(e, e.source, 'peer') : e)))
    const rest = es.filter((e) => e !== link && !(e.source === link.source && e.data?.role === 'uplink'))
    if (wouldLoop(link.source, link.target, gatewayMap(rest))) return toast.error('That would put a device above itself')
    setEdges(es.map((e) => {
      if (e === link) return orient(e, e.source, 'uplink')
      if (e.source === link.source && e.data?.role === 'uplink') return orient(e, e.source, 'peer')
      return e
    }))
  }, [rf, setEdges])

  const swap = useCallback((id: string) => {
    const es = rf.getEdges()
    const link = es.find((e) => e.id === id)
    if (!link) return
    const flipped = orient(link, link.target, link.data!.role)
    if (link.data!.role !== 'uplink') return setEdges(es.map((e) => (e === link ? flipped : e)))
    const rest = es.filter((e) => e !== link && !(e.source === flipped.source && e.data?.role === 'uplink'))
    if (wouldLoop(flipped.source, flipped.target, gatewayMap(rest))) {
      toast('Turned round, it would loop, so it is now a plain connection')
      return setEdges(es.map((e) => (e === link ? orient(flipped, flipped.source, 'peer') : e)))
    }
    setEdges(es.map((e) => {
      if (e === link) return flipped
      if (e.source === flipped.source && e.data?.role === 'uplink') return orient(e, e.source, 'peer')
      return e
    }))
  }, [rf, setEdges])

  const updateZone = useCallback((id: string, patch: Partial<ZoneData>) => {
    setNodes((ns) => ns.map((n) => (n.id === id && isZone(n) ? { ...n, data: { ...n.data, ...patch } } : n)))
  }, [setNodes])

  const removeNode = useCallback((id: string) => { void rf.deleteElements({ nodes: [{ id }] }) }, [rf])
  const removeEdge = useCallback((id: string) => { void rf.deleteElements({ edges: [{ id }] }) }, [rf])

  const wrapSelection = useCallback(() => {
    const picked = rf.getNodes().filter((n) => n.selected && isDevice(n))
    if (!picked.length) return
    const box = wrap(picked.map((n) => n.position), DEVICE_W, Math.max(...picked.map((n) => sizeOf(n).h)))
    addZone(undefined, box)
  }, [rf, addZone])

  const removeSelection = useCallback(() => {
    void rf.deleteElements({
      nodes: rf.getNodes().filter((n) => n.selected).map((n) => ({ id: n.id })),
      edges: rf.getEdges().filter((e) => e.selected).map((e) => ({ id: e.id })),
    })
  }, [rf])

  const onMeta = useCallback(async (patch: Partial<Pick<MapMeta, 'name' | 'description' | 'location_id'>>) => {
    try {
      const s = await updateNetworkMap(initial.id, patch)
      setMeta((m) => ({ ...m, name: s.name, description: s.description, location_id: s.location_id }))
      setLocationName(s.location_name)
      queryClient.invalidateQueries({ queryKey: ['network-maps'] })
    } catch (err) {
      toast.error(errorDetail(err))
    }
  }, [initial.id, queryClient])

  // ── keys, focus, fullscreen ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if (mod && k === 'y') { e.preventDefault(); redo() }
      else if (!mod && !e.altKey && k === 'f') { rf.fitView({ padding: 0.15, duration: 400, maxZoom: 1.1 }) }
      else if (e.key === 'Escape') { setNodes((ns) => deselected(ns)); setEdges((es) => deselected(es)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, rf, setNodes, setEdges])

  useEffect(() => {
    const focus = params.get('focus')
    if (!focus) return
    const target = rf.getNodes().find((n) => isDevice(n) && (n.data.system_id === focus || n.id === focus))
    if (target) {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === target.id })))
      const { w, h } = sizeOf(target)
      // After the initial fit, which would otherwise undo this.
      window.setTimeout(() => rf.setCenter(target.position.x + w / 2, target.position.y + h / 2, { zoom: 1, duration: 700 }), 250)
    }
    params.delete('focus')
    setParams(params, { replace: true })
    // Once, on open.
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shellRef.current?.requestFullscreen()
  }

  // ── what nodes and edges read ──────────────────────────────────────────
  const view: MapView = useMemo(() => ({
    records, live, pathNodes, pathEdges, dropTarget, showFlow, childCount, checkpoint,
  }), [records, live, pathNodes, pathEdges, dropTarget, showFlow, childCount, checkpoint])

  const laidEdges = useMemo(() => withLanes(edges), [edges])

  const sole = selectedNodes.length + selectedEdges.length === 1
  const multi = selectedNodes.length + selectedEdges.length > 1 ? {
    devices: selectedNodes.filter(isDevice).length,
    zones: selectedNodes.filter(isZone).length,
    links: selectedEdges.length,
  } : null
  const liveStates = [...live.values()]
  const placedCount = devices.filter((d) => d.data.system_id).length
  const stats = {
    devices: devices.length,
    links: edges.length,
    placed: placedCount,
    records: unplaced.length + placedCount,
    up: liveStates.filter((l) => l.state === 'up' || l.state === 'online').length,
    down: liveStates.filter((l) => l.state === 'down').length,
  }

  return (
    <div
      ref={shellRef}
      className={cn('nm-shell', fullscreen && 'is-fullscreen')}
      style={{ left: sidebarCollapsed ? 64 : 240 }}
    >
      <Palette
        unplaced={unplaced}
        totalRecords={stats.records}
        collapsed={paletteCollapsed}
        onToggle={() => setPaletteCollapsed((c) => !c)}
        onPlaceAll={placeAll}
        onAddKind={(kind) => addDevice({ kind, gateway: soleDeviceId ?? undefined })}
        onAddRecord={(record) => addDevice({ kind: inferKind(record), record, gateway: soleDeviceId ?? undefined })}
        onAddZone={() => addZone()}
      />

      <div
        ref={canvasRef}
        className="nm-canvas"
        data-far={far}
        onDragOver={onDragOver}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null) }}
        onDrop={onDrop}
      >
        <MapViewContext.Provider value={view}>
          <ReactFlow<MapFlowNode, LinkEdge>
            nodes={nodes}
            edges={laidEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={DraftConnection}
            connectionRadius={30}
            onBeforeDelete={onBeforeDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMove={(_, vp) => setFar(vp.zoom < 0.6)}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
            minZoom={0.12}
            maxZoom={2.5}
            snapToGrid
            snapGrid={[8, 8]}
            selectionKeyCode="Shift"
            multiSelectionKeyCode={['Meta', 'Control']}
            elevateNodesOnSelect={false}
            elevateEdgesOnSelect
            zoomOnDoubleClick={false}
            attributionPosition="bottom-center"
          >
            <Background id="minor" variant={BackgroundVariant.Lines} gap={24} className="nm-bg nm-bg--minor" />
            <Background id="major" variant={BackgroundVariant.Lines} gap={192} className="nm-bg nm-bg--major" />
            <MiniMap
              pannable
              zoomable
              className="nm-minimap"
              nodeBorderRadius={0}
              nodeClassName={(n) => (n.type === 'zone' ? 'nm-mini-zone' : `nm-mini-dev nm-mini--${live.get(n.id)?.state ?? 'unknown'}`)}
            />

            <Panel position="top-left" className="nm-titlebar">
              <Link to="/network-maps" className="nm-back" title="All network maps"><ArrowLeft className="h-3.5 w-3.5" /></Link>
              <div className="min-w-0">
                <div className="kicker truncate">{[meta.organization_name, locationName].filter(Boolean).join(' · ')}</div>
                <h1 className="nm-title truncate">{meta.name}</h1>
              </div>
            </Panel>

            <Panel position="top-right" className="nm-toolbar">
              <button onClick={undo} disabled={!past.current.length} title="Undo (Ctrl Z)"><Undo2 /></button>
              <button onClick={redo} disabled={!future.current.length} title="Redo (Ctrl Shift Z)"><Redo2 /></button>
              <i />
              <button onClick={arrange} disabled={!devices.length} title="Arrange by gateway: the tree from the top down"><LayoutGrid /><span>Arrange</span></button>
              <button onClick={() => addZone()} title="Add a zone"><SquareDashed /><span>Zone</span></button>
              <button onClick={() => setShowFlow((f) => !f)} className={cn(showFlow && 'is-on')} title="Animate traffic towards each gateway"><Waves /><span>Flow</span></button>
              <i />
              <button onClick={() => rf.fitView({ padding: 0.15, duration: 400, maxZoom: 1.1 })} title="Fit the map (F)"><Focus /></button>
              <button onClick={toggleFullscreen} title={fullscreen ? 'Leave full screen' : 'Full screen'}>{fullscreen ? <Shrink /> : <Expand />}</button>
              <i />
              <SaveStatus state={saveState} savedAt={savedAt} onRetry={() => void flush()} />
            </Panel>

            <Panel position="bottom-left" className="nm-titleblock-panel">
              <TitleBlock name={meta.name} org={meta.organization_name} site={locationName} rev={versionRef.current} date={savedAt} />
            </Panel>
          </ReactFlow>
        </MapViewContext.Provider>

        {devices.length === 0 && (
          <div className="nm-empty">
            <div className="kicker">§ An empty sheet</div>
            <h2>Start from the way out.</h2>
            <p>
              Put the internet at the top and the gateway under it, then plug everything else in below.
              Or place every system of {meta.organization_name ?? 'this organisation'} and wire them up.
            </p>
            <div className="nm-empty-actions">
              <button className="btn-base btn-primary" onClick={startFromTheTop}><Globe className="h-3.5 w-3.5" /> Internet &amp; gateway</button>
              {unplaced.length > 0 && (
                <button className="btn-base btn-secondary" onClick={placeAll}><Wand2 className="h-3.5 w-3.5" /> Place {unplaced.length} systems</button>
              )}
            </div>
          </div>
        )}

        {saveState === 'conflict' && (
          <div className="nm-conflict">
            <div>
              <b>This map was saved somewhere else</b> since you opened it. Your latest changes are not saved yet.
            </div>
            <button className="btn-base btn-secondary nm-btn" onClick={() => void reload()}>Load theirs</button>
            <button className="btn-base btn-danger nm-btn" onClick={overwrite}>Keep mine</button>
          </div>
        )}
      </div>

      <Inspector
        device={sole && soleDevice ? soleDevice : null}
        link={sole && selectedEdges.length === 1 ? selectedEdges[0] : null}
        zone={sole && selectedNodes.length === 1 && isZone(selectedNodes[0]) ? selectedNodes[0] : null}
        multi={multi}
        devices={devices}
        edges={edges}
        records={records}
        unplaced={unplaced}
        live={live}
        gateways={gateways}
        descendants={descendants}
        autoFocusId={autoFocusId}
        checkpoint={checkpoint}
        deviceTools={{
          update: updateDevice, setGateway, linkRecord, promote, selectEdge, remove: removeNode,
          attachChild: (id, kind) => addDevice({ kind, gateway: id }),
        }}
        linkTools={{ update: updateLink, setRole, swap, remove: removeEdge }}
        zoneTools={{ update: updateZone, remove: removeNode }}
        onWrapInZone={wrapSelection}
        onRemoveSelection={removeSelection}
        meta={meta}
        locations={locations.data ?? []}
        onMeta={onMeta}
        stats={stats}
        liveConfigured={!!uptime.data?.configured || recordList.some((r) => r.mesh_node_id)}
      />
    </div>
  )
}

function SaveStatus({ state, savedAt, onRetry }: { state: SaveState; savedAt: string; onRetry: () => void }) {
  const time = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const text = {
    saved: `Saved ${time}`,
    dirty: 'Unsaved',
    saving: 'Saving…',
    error: 'Not saved · retry',
    conflict: 'Conflict',
  }[state]
  return (
    <button className={cn('nm-save', `is-${state}`)} onClick={state === 'error' ? onRetry : undefined} disabled={state !== 'error'} title={state === 'saved' ? 'Every change saves itself' : undefined}>
      <span className="nm-save-dot" />
      <span>{text}</span>
    </button>
  )
}

/** The drawing's title block, as on an engineering sheet. */
function TitleBlock({ name, org, site, rev, date }: { name: string; org: string | null; site: string | null; rev: number; date: string }) {
  const zoom = useStore((s) => s.transform[2])
  return (
    <div className="nm-titleblock">
      <div className="nm-tb-cell nm-tb-cell--wide">
        <span>Network map</span>
        <b>{name}</b>
      </div>
      <div className="nm-tb-cell">
        <span>Client</span>
        <b>{org ?? '—'}</b>
      </div>
      <div className="nm-tb-cell">
        <span>Site</span>
        <b>{site ?? 'All'}</b>
      </div>
      <div className="nm-tb-cell">
        <span>Rev</span>
        <b className="tnum">{String(rev).padStart(3, '0')}</b>
      </div>
      <div className="nm-tb-cell">
        <span>Date</span>
        <b className="tnum">{new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b>
      </div>
      <div className="nm-tb-cell">
        <span>Scale</span>
        <b className="tnum">{Math.round(zoom * 100)}%</b>
      </div>
    </div>
  )
}

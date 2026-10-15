import { createContext, useContext } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type {
  LinkKind, LinkRole, MapGraphSave, MapLink, MapNode, MapRecord, MapZone, NodeKind, ZoneTone,
} from '@/types'
import type { Live } from './status'

// ── what React Flow holds ────────────────────────────────────────────────

export type DeviceData = {
  kind: NodeKind
  label: string | null
  address: string | null
  functions: string[]
  notes: string | null
  system_id: string | null
}

export type ZoneData = {
  label: string
  tone: ZoneTone
  notes: string | null
}

export type DeviceNode = Node<DeviceData, 'device'>
export type ZoneNode = Node<ZoneData, 'zone'>
export type MapFlowNode = DeviceNode | ZoneNode

export type LinkData = {
  role: LinkRole
  kind: LinkKind
  label: string | null
  source_port: string | null
  target_port: string | null
  speed: string | null
  vlan: string | null
  notes: string | null
  /** Drawing only, never saved: which of several parallel links this is. */
  lane?: number
  lanes?: number
}

export type LinkEdge = Edge<LinkData, 'link'>

export const isDevice = (n: MapFlowNode): n is DeviceNode => n.type === 'device'
export const isZone = (n: MapFlowNode): n is ZoneNode => n.type === 'zone'

export const newId = () => crypto.randomUUID()

/** What the palette puts on a drag: a record to place, a kind to sketch, or a zone. */
export const DND_TYPE = 'application/x-docuvault-map'
export type DragPayload = { record: string } | { kind: NodeKind } | { zone: true }

// ── to and from the API ──────────────────────────────────────────────────

export function toDeviceNode(n: MapNode): DeviceNode {
  return {
    id: n.id,
    type: 'device',
    position: { x: n.x, y: n.y },
    data: {
      kind: n.kind, label: n.label, address: n.address, functions: n.functions ?? [],
      notes: n.notes, system_id: n.system_id,
    },
  }
}

export function toZoneNode(z: MapZone): ZoneNode {
  return {
    id: z.id,
    type: 'zone',
    position: { x: z.x, y: z.y },
    width: z.width,
    height: z.height,
    zIndex: -1,
    dragHandle: '.nm-zone-grip',
    style: { pointerEvents: 'none' },
    data: { label: z.label, tone: z.tone, notes: z.notes },
  }
}

export function toLinkEdge(l: MapLink): LinkEdge {
  return {
    id: l.id,
    type: 'link',
    source: l.source_node_id,
    target: l.target_node_id,
    data: {
      role: l.role, kind: l.kind, label: l.label, source_port: l.source_port,
      target_port: l.target_port, speed: l.speed, vlan: l.vlan, notes: l.notes,
    },
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** The drawing as the API stores it. Equal drawings serialise identically. */
export function toGraph(nodes: MapFlowNode[], edges: LinkEdge[]): Omit<MapGraphSave, 'version' | 'viewport'> {
  const devices: MapNode[] = []
  const zones: MapZone[] = []
  for (const n of nodes) {
    if (isDevice(n)) {
      devices.push({
        id: n.id, system_id: n.data.system_id, kind: n.data.kind,
        label: n.data.label?.trim() || null, address: n.data.address?.trim() || null,
        x: r1(n.position.x), y: r1(n.position.y),
        functions: n.data.functions, notes: n.data.notes || null,
      })
    } else if (isZone(n)) {
      zones.push({
        id: n.id, label: n.data.label, tone: n.data.tone, notes: n.data.notes || null,
        x: r1(n.position.x), y: r1(n.position.y),
        width: r1(n.width ?? n.measured?.width ?? 400), height: r1(n.height ?? n.measured?.height ?? 260),
      })
    }
  }
  const links: MapLink[] = edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    target_node_id: e.target,
    role: e.data!.role,
    kind: e.data!.kind,
    label: e.data!.label?.trim() || null,
    source_port: e.data!.source_port?.trim() || null,
    target_port: e.data!.target_port?.trim() || null,
    speed: e.data!.speed?.trim() || null,
    vlan: e.data!.vlan?.trim() || null,
    notes: e.data!.notes || null,
  }))
  return { nodes: devices, links, zones }
}

// ── the uplink tree ──────────────────────────────────────────────────────

/** device id → its gateway's id */
export function gatewayMap(edges: LinkEdge[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of edges) if (e.data?.role === 'uplink') m.set(e.source, e.target)
  return m
}

/** The chain of gateways above `id`, nearest first. */
export function upstream(id: string, gateways: Map<string, string>): string[] {
  const out: string[] = []
  const seen = new Set([id])
  let cur = gateways.get(id)
  while (cur && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = gateways.get(cur)
  }
  return out
}

/** Everything that reaches the gateway through `id`. */
export function downstream(id: string, gateways: Map<string, string>): Set<string> {
  const kids = new Map<string, string[]>()
  for (const [child, parent] of gateways) kids.set(parent, [...(kids.get(parent) ?? []), child])
  const out = new Set<string>()
  const stack = [...(kids.get(id) ?? [])]
  while (stack.length) {
    const c = stack.pop()!
    if (out.has(c)) continue
    out.add(c)
    stack.push(...(kids.get(c) ?? []))
  }
  return out
}

/** Would making `gateway` the gateway of `device` close a loop? */
export function wouldLoop(device: string, gateway: string, gateways: Map<string, string>): boolean {
  return device === gateway || upstream(gateway, gateways).includes(device)
}

// ── what every node and edge reads while drawing ─────────────────────────

export interface MapView {
  records: Map<string, MapRecord>
  live: Map<string, Live>
  /** Devices and links on the route from the selected device to the top. */
  pathNodes: Set<string>
  pathEdges: Set<string>
  dropTarget: string | null
  showFlow: boolean
  childCount: Map<string, number>
  /** Record the drawing as it is now, so the next change can be undone. */
  checkpoint: () => void
}

export const MapViewContext = createContext<MapView | null>(null)

export function useMapView(): MapView {
  const v = useContext(MapViewContext)
  if (!v) throw new Error('useMapView outside the map')
  return v
}

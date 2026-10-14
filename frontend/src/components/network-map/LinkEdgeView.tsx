import { memo } from 'react'
import {
  BaseEdge, EdgeLabelRenderer, useInternalNode, useReactFlow,
  type ConnectionLineComponentProps, type EdgeProps, type InternalNode,
} from '@xyflow/react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEVICE_H, DEVICE_W } from './layout'
import { useMapView, type LinkData, type LinkEdge, type MapFlowNode } from './model'

type Pt = { x: number; y: number }
type Box = { x: number; y: number; w: number; h: number }
type Side = 'top' | 'right' | 'bottom' | 'left'

/** How far a line leaves a device before it turns; also where a gateway's bus runs. */
const STUB = 18
/**
 * Devices further below their gateway than this (a full row of others in
 * between) hang off a spine at their left rather than rising through that row.
 */
const COMB_GAP = 180

const box = (n: InternalNode<MapFlowNode>): Box => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  w: n.measured?.width ?? DEVICE_W,
  h: n.measured?.height ?? DEVICE_H,
})

interface Route {
  points: Pt[]
  label: Pt
  /** 'left': the label starts at `label` rather than centring on it. */
  anchor?: 'left'
  ends: [Pt & { side: Side }, Pt & { side: Side }]
  /**
   * Where each end's port name goes. Siblings share the point where they
   * meet their gateway, so a gateway's port is named on the device's own
   * riser instead, or (null) folded into the label when there is no riser.
   */
  tags: [Pt & { side: Side }, (Pt & { side: Side }) | null]
}

/**
 * Orthogonal routing chosen for a network drawing rather than a flowchart:
 * a device under its gateway rises to a bus that runs just beneath the
 * gateway, so siblings share one horizontal line; a device far below (a
 * grid of desks under a switch) joins a spine at its left; anything else
 * leaves by whichever pair of faces looks at each other.
 */
function route(a: Box, b: Box, data: LinkData): Route {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const gapX = Math.abs(bc.x - ac.x) - (a.w + b.w) / 2
  const gapY = Math.abs(bc.y - ac.y) - (a.h + b.h) / 2
  const lane = ((data.lane ?? 0) - ((data.lanes ?? 1) - 1) / 2) * 10
  const hangsBelow = data.role === 'uplink' && ac.y > bc.y

  if (hangsBelow && gapY > COMB_GAP) {
    const s = { x: a.x, y: ac.y + lane, side: 'left' as Side }
    const t = { x: bc.x + lane, y: b.y + b.h, side: 'bottom' as Side }
    const spine = s.x - STUB
    const bus = t.y + STUB + lane
    return {
      points: [s, { x: spine, y: s.y }, { x: spine, y: bus }, { x: t.x, y: bus }, t],
      // In the gap under the device: the spine runs between plates and has no room.
      label: { x: a.x + 4, y: a.y + a.h + 13 },
      anchor: 'left',
      ends: [s, t],
      tags: [s, null],
    }
  }

  // A device under its gateway always rises to the gateway's bus, however
  // far to the side it sits: that is what makes the tree read as a tree.
  if (gapY >= gapX || (hangsBelow && gapY > 12)) {
    const down = ac.y < bc.y
    const s = { x: ac.x + lane, y: down ? a.y + a.h : a.y, side: (down ? 'bottom' : 'top') as Side }
    const t = { x: bc.x + lane, y: down ? b.y : b.y + b.h, side: (down ? 'top' : 'bottom') as Side }
    const mid = (s.y + t.y) / 2
    const bus = hangsBelow ? Math.max(Math.min(t.y + STUB + lane, mid), t.y + 4) : mid
    const points = Math.abs(s.x - t.x) < 1 ? [s, t] : [s, { x: s.x, y: bus }, { x: t.x, y: bus }, t]
    // On the device's own riser, which no sibling shares.
    const label = hangsBelow ? { x: s.x, y: (s.y + bus) / 2 } : midpoint(points)
    const gatewayTag = hangsBelow ? { x: s.x, y: bus, side: 'bottom' as Side } : t
    return { points, label, ends: [s, t], tags: [s, gatewayTag] }
  }

  const right = ac.x < bc.x
  const s = { x: right ? a.x + a.w : a.x, y: ac.y + lane, side: (right ? 'right' : 'left') as Side }
  const t = { x: right ? b.x : b.x + b.w, y: bc.y + lane, side: (right ? 'left' : 'right') as Side }
  const mid = (s.x + t.x) / 2
  const points = Math.abs(s.y - t.y) < 1 ? [s, t] : [s, { x: mid, y: s.y }, { x: mid, y: t.y }, t]
  return { points, label: midpoint(points), ends: [s, t], tags: [s, t] }
}

function midpoint(points: Pt[]): Pt {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let half = lengths.reduce((s, l) => s + l, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (half <= lengths[i]) {
      const f = lengths[i] ? half / lengths[i] : 0
      return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f }
    }
    half -= lengths[i]
  }
  return points[points.length - 1]
}

/** A polyline with its corners rounded off. */
function rounded(points: Pt[], radius = 9): string {
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1], c = points[i], n = points[i + 1]
    const r = Math.min(radius, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2)
    const inX = c.x + Math.sign(p.x - c.x) * r, inY = c.y + Math.sign(p.y - c.y) * r
    const outX = c.x + Math.sign(n.x - c.x) * r, outY = c.y + Math.sign(n.y - c.y) * r
    d += ` L ${inX} ${inY} Q ${c.x} ${c.y} ${outX} ${outY}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/** Where a port name sits: just off the device, beside the line. */
function tagAt(end: Pt & { side: Side }): { x: number; y: number; transform: string } {
  switch (end.side) {
    case 'top': return { x: end.x + 5, y: end.y - 4, transform: 'translate(0, -100%)' }
    case 'bottom': return { x: end.x + 5, y: end.y + 4, transform: 'translate(0, 0)' }
    case 'left': return { x: end.x - 5, y: end.y - 3, transform: 'translate(-100%, -100%)' }
    case 'right': return { x: end.x + 5, y: end.y - 3, transform: 'translate(0, -100%)' }
  }
}

export const LinkEdgeView = memo(function LinkEdgeView({ id, source, target, data, selected }: EdgeProps<LinkEdge>) {
  const s = useInternalNode<MapFlowNode>(source)
  const t = useInternalNode<MapFlowNode>(target)
  const view = useMapView()
  const { setEdges, setNodes } = useReactFlow<MapFlowNode, LinkEdge>()
  if (!s || !t || !data) return null

  const r = route(box(s), box(t), data)
  const path = rounded(r.points)
  const down = view.live.get(source)?.state === 'down' || view.live.get(target)?.state === 'down'
  const onPath = view.pathEdges.has(id)
  const flowing = (view.showFlow || onPath) && !down && data.kind !== 'logical'
  const folded = r.tags[1] === null && data.target_port ? `→ ${data.target_port}` : null
  const facts = [data.speed, data.vlan && `VLAN ${data.vlan}`, folded].filter(Boolean) as string[]
  const hasLabel = facts.length > 0 || !!data.label || data.kind === 'vpn'

  const select = () => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
    setEdges((es) => es.map((e) => (e.selected === (e.id === id) ? e : { ...e, selected: e.id === id })))
  }

  return (
    <>
      <g
        className={cn(
          'nm-link', `nm-link--${data.kind}`,
          data.role === 'uplink' && 'is-uplink',
          selected && 'is-selected', onPath && 'is-path', down && 'is-down',
        )}
      >
        <BaseEdge id={id} path={path} interactionWidth={18} className="nm-stroke" />
        {data.kind === 'trunk' && <path d={path} className="nm-gap" />}
        {flowing && <path d={path} className="nm-flow" />}
        {r.ends.map((e, i) => (
          <rect
            key={i}
            x={e.x - 2.5} y={e.y - 2.5} width={5} height={5}
            className={cn('nm-port-end', i === 1 && data.role === 'uplink' && 'is-gateway')}
          />
        ))}
      </g>
      <EdgeLabelRenderer>
        {hasLabel && (
          <div
            className={cn('nm-edge-label nodrag nopan', selected && 'is-selected', onPath && 'is-path')}
            style={{ transform: `translate(${r.anchor === 'left' ? '0' : '-50%'}, -50%) translate(${r.label.x}px, ${r.label.y}px)` }}
            onClick={select}
          >
            {data.kind === 'vpn' && <Lock className="h-2.5 w-2.5" />}
            {facts.map((f) => <b key={f}>{f}</b>)}
            {data.label && <span>{data.label}</span>}
          </div>
        )}
        {[data.source_port, data.target_port].map((port, i) => {
          const end = r.tags[i]
          if (!port || !end) return null
          const at = tagAt(end)
          return (
            <div
              key={i}
              className={cn('nm-port-tag nodrag nopan', selected && 'is-selected')}
              style={{ transform: `translate(${at.x}px, ${at.y}px) ${at.transform}` }}
              onClick={select}
            >
              {port}
            </div>
          )
        })}
      </EdgeLabelRenderer>
    </>
  )
})

/** The line drawn while dragging out a new connection. */
export function DraftConnection({ fromX, fromY, toX, toY, connectionStatus }: ConnectionLineComponentProps) {
  const valid = connectionStatus === 'valid'
  return (
    <g className={cn('nm-draft', valid && 'is-valid')}>
      <path d={`M ${fromX} ${fromY} L ${toX} ${toY}`} />
      <rect x={toX - 4} y={toY - 4} width={8} height={8} />
    </g>
  )
}

import type { NodeKind } from '@/types'
import { NODE_KINDS, TIER_RANK } from './catalogue'

export const DEVICE_W = 208
export const DEVICE_H = 124
const COL_GAP = 28
const ROW_GAP = 84
const GRID_ROW = DEVICE_H + 36
/** More leaf devices than this under one parent are packed into a grid. */
const FAN_LIMIT = 5
const GRID_COLS = 4

export interface LayoutDevice {
  id: string
  kind: NodeKind
  name: string
}

export interface LayoutLink {
  source: string
  target: string
  role: 'uplink' | 'peer'
}

type Pos = { x: number; y: number }

const rank = (d: LayoutDevice) => TIER_RANK[NODE_KINDS[d.kind]?.tier ?? 'endpoint']

function bySeniority(a: LayoutDevice, b: LayoutDevice) {
  return rank(a) - rank(b) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, undefined, { numeric: true })
}

/**
 * Lays the uplink tree out top-down: the outside world at the top, each
 * device under its gateway. A parent with many leaf devices (a switch full
 * of desks) gets them as a compact grid rather than one very wide row.
 * Devices with neither gateway nor dependants go in a block underneath.
 * Returns top-left positions keyed by id.
 */
export function layoutTree(devices: LayoutDevice[], links: LayoutLink[]): Map<string, Pos> {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const children = new Map<string, LayoutDevice[]>()
  const hasGateway = new Set<string>()
  for (const l of links) {
    if (l.role !== 'uplink' || !byId.has(l.source) || !byId.has(l.target)) continue
    hasGateway.add(l.source)
    const list = children.get(l.target) ?? []
    list.push(byId.get(l.source)!)
    children.set(l.target, list)
  }
  for (const list of children.values()) list.sort(bySeniority)

  const roots = devices.filter((d) => !hasGateway.has(d.id) && children.has(d.id)).sort(bySeniority)
  const loose = devices.filter((d) => !hasGateway.has(d.id) && !children.has(d.id)).sort(bySeniority)

  // Width each subtree needs, memoised.
  const widths = new Map<string, number>()
  const split = (id: string) => {
    const kids = children.get(id) ?? []
    const leaves = kids.filter((k) => !children.has(k.id))
    const branches = kids.filter((k) => children.has(k.id))
    const gridded = leaves.length > FAN_LIMIT
    return { kids, leaves, branches, gridded }
  }
  const gridWidth = (n: number) => {
    const cols = Math.min(GRID_COLS, n)
    return cols * DEVICE_W + (cols - 1) * COL_GAP
  }
  const width = (id: string): number => {
    const cached = widths.get(id)
    if (cached !== undefined) return cached
    const { kids, leaves, branches, gridded } = split(id)
    let w: number
    if (kids.length === 0) w = DEVICE_W
    else {
      const parts = gridded
        ? [...branches.map((b) => width(b.id)), gridWidth(leaves.length)]
        : kids.map((k) => width(k.id))
      w = Math.max(DEVICE_W, parts.reduce((s, p) => s + p, 0) + (parts.length - 1) * COL_GAP)
    }
    widths.set(id, w)
    return w
  }

  const out = new Map<string, Pos>()
  let maxY = 0
  const place = (id: string, left: number, y: number) => {
    const w = width(id)
    out.set(id, { x: left + (w - DEVICE_W) / 2, y })
    maxY = Math.max(maxY, y)
    const { kids, leaves, branches, gridded } = split(id)
    if (kids.length === 0) return
    const childY = y + DEVICE_H + ROW_GAP
    const parts: { w: number; draw: (x: number) => void }[] = gridded
      ? [
          ...branches.map((b) => ({ w: width(b.id), draw: (x: number) => place(b.id, x, childY) })),
          {
            w: gridWidth(leaves.length),
            draw: (x: number) => leaves.forEach((leaf, i) => {
              const ly = childY + Math.floor(i / GRID_COLS) * GRID_ROW
              out.set(leaf.id, { x: x + (i % GRID_COLS) * (DEVICE_W + COL_GAP), y: ly })
              maxY = Math.max(maxY, ly)
            }),
          },
        ]
      : kids.map((k) => ({ w: width(k.id), draw: (x: number) => place(k.id, x, childY) }))
    const total = parts.reduce((s, p) => s + p.w, 0) + (parts.length - 1) * COL_GAP
    let x = left + (w - total) / 2
    for (const p of parts) { p.draw(x); x += p.w + COL_GAP }
  }

  let cursor = 0
  for (const r of roots) {
    place(r.id, cursor, 0)
    cursor += width(r.id) + COL_GAP * 3
  }

  // A device joined to the tree only by a peer link (a VPN to the cloud, a
  // stacked partner) sits beside that peer rather than in the pile below.
  const peersOf = new Map<string, string[]>()
  for (const l of links) {
    if (l.role !== 'peer') continue
    peersOf.set(l.source, [...(peersOf.get(l.source) ?? []), l.target])
    peersOf.set(l.target, [...(peersOf.get(l.target) ?? []), l.source])
  }
  const free = (x: number, y: number) => ![...out.values()].some(
    (p) => x < p.x + DEVICE_W + COL_GAP && p.x < x + DEVICE_W + COL_GAP && y < p.y + DEVICE_H && p.y < y + DEVICE_H,
  )
  let pending = loose
  for (let placed = true; placed && pending.length;) {
    placed = false
    const still: LayoutDevice[] = []
    for (const d of pending) {
      const anchor = (peersOf.get(d.id) ?? []).map((id) => out.get(id)).find(Boolean)
      if (!anchor) { still.push(d); continue }
      let x = anchor.x + DEVICE_W + COL_GAP * 3
      while (!free(x, anchor.y)) x += DEVICE_W + COL_GAP
      out.set(d.id, { x, y: anchor.y })
      placed = true
    }
    pending = still
  }
  loose.splice(0, loose.length, ...pending)

  if (loose.length) {
    const top = out.size ? maxY + DEVICE_H + ROW_GAP * 1.6 : 0
    const cols = Math.max(GRID_COLS, Math.min(8, Math.ceil(Math.sqrt(loose.length * 2))))
    const blockW = Math.min(cols, loose.length) * (DEVICE_W + COL_GAP) - COL_GAP
    const treeW = Math.max(cursor - COL_GAP * 3, blockW)
    const left = (treeW - blockW) / 2
    loose.forEach((d, i) => {
      out.set(d.id, {
        x: left + (i % cols) * (DEVICE_W + COL_GAP),
        y: top + Math.floor(i / cols) * GRID_ROW,
      })
    })
  }
  return out
}

export interface Rect { x: number; y: number; width: number; height: number }

export function contains(r: Rect, p: Pos, w = DEVICE_W, h = DEVICE_H) {
  const cx = p.x + w / 2
  const cy = p.y + h / 2
  return cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height
}

/** The zone that wraps these device positions, with room for its label. */
export function wrap(points: Pos[], w = DEVICE_W, h = DEVICE_H): Rect {
  const pad = 36
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad - 22
  return {
    x,
    y,
    width: Math.max(...xs) + w + pad - x,
    height: Math.max(...ys) + h + pad - y,
  }
}

/** Where a device newly attached under `parent` should go: below it, to the right of its siblings. */
export function childSlot(parent: Pos, siblings: Pos[]): Pos {
  const y = parent.y + DEVICE_H + ROW_GAP
  if (siblings.length === 0) return { x: parent.x, y }
  const below = siblings.filter((s) => Math.abs(s.y - y) < DEVICE_H)
  const rightmost = below.length ? Math.max(...below.map((s) => s.x)) : parent.x - DEVICE_W - COL_GAP
  return { x: rightmost + DEVICE_W + COL_GAP, y }
}

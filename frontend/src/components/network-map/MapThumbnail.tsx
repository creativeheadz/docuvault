import type { NetworkMapSummary } from '@/types'
import { NODE_KINDS } from './catalogue'
import { DEVICE_H, DEVICE_W } from './layout'

/** The drawing in miniature: zones, wires and plates, fitted to the card. */
export function MapThumbnail({ preview }: { preview: NetworkMapSummary['preview'] }) {
  const W = 320
  const H = 150
  const { nodes, links, zones } = preview
  if (!nodes.length && !zones.length) {
    return (
      <svg className="nm-thumb" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => <line key={`v${i}`} className="grid-line" x1={i * 24} y1={0} x2={i * 24} y2={H} />)}
        {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} className="grid-line" x1={0} y1={i * 24} x2={W} y2={i * 24} />)}
      </svg>
    )
  }

  const xs = [...nodes.map(([x]) => x), ...nodes.map(([x]) => x + DEVICE_W), ...zones.flatMap(([x, , w]) => [x, x + w])]
  const ys = [...nodes.map(([, y]) => y), ...nodes.map(([, y]) => y + DEVICE_H), ...zones.flatMap(([, y, , h]) => [y, y + h])]
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 14
  const scale = Math.min((W - pad * 2) / Math.max(maxX - minX, 1), (H - pad * 2) / Math.max(maxY - minY, 1), 0.5)
  const ox = (W - (maxX - minX) * scale) / 2 - minX * scale
  const oy = (H - (maxY - minY) * scale) / 2 - minY * scale
  const tx = (x: number) => x * scale + ox
  const ty = (y: number) => y * scale + oy
  const w = DEVICE_W * scale
  const h = DEVICE_H * scale

  return (
    <svg className="nm-thumb" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => <line key={`v${i}`} className="grid-line" x1={i * 24} y1={0} x2={i * 24} y2={H} />)}
      {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} className="grid-line" x1={0} y1={i * 24} x2={W} y2={i * 24} />)}
      {zones.map(([x, y, zw, zh], i) => (
        <rect key={`z${i}`} className="zone" x={tx(x)} y={ty(y)} width={zw * scale} height={zh * scale} />
      ))}
      {links.map(([a, b], i) => {
        const [ax, ay] = nodes[a]
        const [bx, by] = nodes[b]
        const x1 = tx(ax) + w / 2, y1 = ty(ay) + h / 2
        const x2 = tx(bx) + w / 2, y2 = ty(by) + h / 2
        const my = (y1 + y2) / 2
        return <path key={`l${i}`} className="wire" d={`M${x1} ${y1} V${my} H${x2} V${y2}`} />
      })}
      {nodes.map(([x, y, kind], i) => {
        const tier = NODE_KINDS[kind]?.tier ?? 'endpoint'
        return (
          <rect
            key={`n${i}`}
            className={`dev tier-${tier}`}
            x={tx(x)} y={ty(y)} width={w} height={h}
            rx={tier === 'outside' ? h / 2 : 0}
          />
        )
      })}
    </svg>
  )
}

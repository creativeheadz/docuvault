import { memo, type CSSProperties } from 'react'
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { NODE_KINDS, nodeName } from './catalogue'
import { useMapView, type DeviceNode } from './model'
import { LIVE_COLOR, UNKNOWN, concerns } from './status'

const SIDES = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
]

/**
 * A device plate. Solid edge: backed by a system record. Dashed:
 * sketched on the map only. The bar down the left is the live signal.
 */
export const DeviceNodeView = memo(function DeviceNodeView({ id, data, selected }: NodeProps<DeviceNode>) {
  const view = useMapView()
  const connection = useConnection()
  const record = data.system_id ? view.records.get(data.system_id) : undefined
  const live = view.live.get(id) ?? UNKNOWN
  const meta = NODE_KINDS[data.kind] ?? NODE_KINDS.other
  const Icon = meta.icon
  const outside = meta.tier === 'outside'
  const name = nodeName(data, record)
  const address = data.address || record?.ip_address || record?.hostname
  const issues = concerns(record)
  const worst = issues.some((i) => i.tone === 'bad') ? 'bad' : 'warn'
  const inbound = record?.firewall_rules.filter((r) => r.direction === 'inbound' && r.status === 'active').length ?? 0
  const feeds = view.childCount.get(id) ?? 0
  const catching = connection.inProgress && connection.fromNode?.id !== id
  const shown = data.functions.slice(0, outside ? 2 : 4)

  return (
    <div
      className={cn(
        'nm-device',
        `tier-${meta.tier}`,
        outside && 'nm-device--outside',
        !data.system_id && 'is-sketch',
        record?.archived && 'is-archived',
        selected && 'is-selected',
        view.pathNodes.has(id) && 'is-path',
        view.dropTarget === id && 'is-drop',
      )}
      data-live={live.state}
      style={{ '--live': LIVE_COLOR[live.state] } as CSSProperties}
    >
      {!outside && <span className="nm-live-bar" />}
      <div className="nm-device-head">
        <span className="nm-glyph"><Icon /></span>
        <span className="nm-kicker">
          {meta.label}
          {record && <span className="nm-rec" title="Backed by a system record">◆</span>}
        </span>
        {live.state !== 'unknown' && <span className="nm-dot" title={live.summary} />}
      </div>
      <div className="nm-name" title={name}>{name}</div>
      {address && <div className="nm-addr" title={address}>{address}</div>}
      {(shown.length > 0 || inbound > 0 || issues.length > 0) && (
        <div className="nm-chips">
          {shown.map((f) => <span key={f} className="nm-chip">{f}</span>)}
          {data.functions.length > shown.length && (
            <span className="nm-chip" title={data.functions.slice(shown.length).join(', ')}>
              +{data.functions.length - shown.length}
            </span>
          )}
          {inbound > 0 && (
            <span className="nm-chip nm-chip--ember" title={`${inbound} inbound firewall rule${inbound === 1 ? '' : 's'}`}>
              ⇣ {inbound}
            </span>
          )}
          {issues.length > 0 && (
            <span className={cn('nm-chip', worst === 'bad' ? 'nm-chip--bad' : 'nm-chip--warn')} title={issues.map((i) => i.text).join(' · ')}>
              CE ×{issues.length}
            </span>
          )}
        </div>
      )}
      {feeds > 0 && !outside && <span className="nm-feeds" title={`${feeds} device${feeds === 1 ? '' : 's'} use this as their gateway`}>{feeds}</span>}

      {SIDES.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} className="nm-handle" />
      ))}
      {catching && (
        <Handle id="catch" type="target" position={Position.Top} className="nm-catch" isConnectableStart={false} />
      )}
    </div>
  )
})

import { useMemo, useState, type DragEvent } from 'react'
import { ChevronLeft, ChevronRight, Search, SquareDashed, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MapRecord, NodeKind } from '@/types'
import { KIND_GROUPS, NODE_KINDS, inferKind } from './catalogue'
import { DND_TYPE, type DragPayload } from './model'

interface PaletteProps {
  unplaced: MapRecord[]
  totalRecords: number
  collapsed: boolean
  onToggle: () => void
  onPlaceAll: () => void
  onAddKind: (kind: NodeKind) => void
  onAddRecord: (record: MapRecord) => void
  onAddZone: () => void
}

function drag(e: DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copy'
}

/** Left rail: the organisation's systems not yet on the map, and blank kinds to sketch with. */
export function Palette({
  unplaced, totalRecords, collapsed, onToggle, onPlaceAll, onAddKind, onAddRecord, onAddZone,
}: PaletteProps) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return unplaced
    return unplaced.filter((r) =>
      [r.name, r.hostname, r.ip_address, r.category, r.model].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [unplaced, query])

  if (collapsed) {
    return (
      <aside className="nm-rail nm-rail--collapsed">
        <button className="nm-rail-toggle" onClick={onToggle} title="Show systems and kinds">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {unplaced.length > 0 && <span className="nm-rail-count" title={`${unplaced.length} systems not on the map`}>{unplaced.length}</span>}
      </aside>
    )
  }

  return (
    <aside className="nm-rail">
      <div className="nm-rail-head">
        <span className="kicker">§ Systems</span>
        <span className="nm-rail-meta tnum">{totalRecords - unplaced.length}/{totalRecords} placed</span>
        <button className="nm-rail-toggle ml-auto" onClick={onToggle} title="Hide panel">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {totalRecords === 0 ? (
        <p className="nm-rail-note">
          This organisation has no systems yet. Sketch devices below, and turn any of them into a system from the inspector.
        </p>
      ) : unplaced.length === 0 ? (
        <p className="nm-rail-note">Every system is on the map.</p>
      ) : (
        <>
          <div className="nm-rail-search">
            <Search className="h-3 w-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a system" />
          </div>
          <ul className="nm-records">
            {shown.map((r) => {
              const kind = inferKind(r)
              const Icon = NODE_KINDS[kind].icon
              return (
                <li
                  key={r.id}
                  draggable
                  onDragStart={(e) => drag(e, { record: r.id })}
                  onDoubleClick={() => onAddRecord(r)}
                  title="Drag onto the map. Drop it on a device to plug it in there."
                >
                  <span className="nm-records-glyph"><Icon /></span>
                  <span className="min-w-0 flex-1">
                    <span className="nm-records-name">{r.name}</span>
                    <span className="nm-records-addr">{r.ip_address || r.hostname || r.category || '—'}</span>
                  </span>
                  {r.mesh_node_id && (
                    <span
                      className={cn('nm-records-dot', r.mesh_agent_connected && 'is-on')}
                      title={r.mesh_agent_connected ? 'Agent online' : 'Agent offline'}
                    />
                  )}
                </li>
              )
            })}
            {shown.length === 0 && <li className="nm-records-none">Nothing matches.</li>}
          </ul>
          <button className="nm-rail-action" onClick={onPlaceAll}>
            <Wand2 className="h-3 w-3" /> Place all {unplaced.length} &amp; arrange
          </button>
        </>
      )}

      <div className="nm-rail-head nm-rail-head--sub">
        <span className="kicker">§ Sketch</span>
      </div>
      <div className="nm-kinds">
        {KIND_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="nm-kinds-title">{g.title}</div>
            <div className="nm-kinds-grid">
              {g.kinds.map((k) => {
                const Icon = NODE_KINDS[k].icon
                return (
                  <button
                    key={k}
                    draggable
                    onDragStart={(e) => drag(e, { kind: k })}
                    onClick={() => onAddKind(k)}
                    title={`${NODE_KINDS[k].label}: drag onto the map, or click to add`}
                  >
                    <Icon />
                    <span>{NODE_KINDS[k].label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div>
          <div className="nm-kinds-title">Areas</div>
          <div className="nm-kinds-grid">
            <button draggable onDragStart={(e) => drag(e, { zone: true })} onClick={onAddZone} title="A labelled area: VLAN, DMZ, floor, rack">
              <SquareDashed />
              <span>Zone</span>
            </button>
          </div>
        </div>
      </div>
      <p className="nm-rail-note nm-rail-note--foot">
        Drag from a device's edge to the device it plugs into. The first connection out of a device becomes its gateway.
      </p>
    </aside>
  )
}

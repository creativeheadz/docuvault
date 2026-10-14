import { memo, type CSSProperties } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { ZONE_TONES } from './catalogue'
import { useMapView, type ZoneNode } from './model'

/**
 * A labelled area behind the devices: a VLAN, a DMZ, a floor, a rack.
 * Only the label tab takes the pointer, so connections inside stay clickable;
 * dragging the tab carries the devices inside along.
 */
export const ZoneNodeView = memo(function ZoneNodeView({ data, selected }: NodeProps<ZoneNode>) {
  const view = useMapView()
  const tone = ZONE_TONES[data.tone] ?? ZONE_TONES.neutral
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={110}
        lineClassName="nm-zone-line"
        handleClassName="nm-zone-handle"
        onResizeStart={view.checkpoint}
      />
      <div className={cn('nm-zone', selected && 'is-selected')} style={{ '--tone': tone.color } as CSSProperties}>
        <i className="nm-reg nm-reg--tl" />
        <i className="nm-reg nm-reg--tr" />
        <i className="nm-reg nm-reg--bl" />
        <i className="nm-reg nm-reg--br" />
        <div className="nm-zone-grip" title={data.notes || 'Drag to move the zone and everything in it'}>
          <span className="nm-zone-mark">§</span>
          {data.label || 'Zone'}
        </div>
      </div>
    </>
  )
})

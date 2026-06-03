// Circles render — a 9:16 mini "circles page" (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label } from './frame'

function Tile({ x, y, name, members, accent }: { x: number; y: number; name: string; members: string; accent?: boolean }) {
  const cx = x + 60
  return (
    <>
      <InnerCard x={x} y={y} w={120} h={150} />
      {/* overlapping member avatars */}
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={cx - 14} cy={y + 44} r={18} fill="currentColor" />
      </g>
      <g className="text-primary-bg">
        <circle cx={cx + 12} cy={y + 44} r={14} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.4}>
        <circle cx={cx + 32} cy={y + 44} r={11} fill="currentColor" />
      </g>
      <Label x={cx} y={y + 92} size={12} weight={700} anchor="middle">{name}</Label>
      <Label x={cx} y={y + 108} size={9} weight={500} tone="text-subtle" anchor="middle">{members}</Label>
      {/* join chip */}
      <g className={accent ? 'text-primary' : 'text-border-strong'} opacity={accent ? 1 : 0.4}>
        <rect x={cx - 26} y={y + 120} width={52} height={16} rx={8} fill="currentColor" />
      </g>
      {accent && <Label x={cx} y={y + 131} size={9} weight={700} tone="text-on-primary" anchor="middle">Joined</Label>}
    </>
  )
}

export function CirclesRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency circles" title="Circles" animate={animate}>
      <Label x={18} y={92} size={10} weight={600} tone="text-subtle">SMALL ROOMS NEAR YOU</Label>
      <Tile x={18} y={104} name="Sunrise Hikers" members="24 members" accent />
      <Tile x={150} y={104} name="Book Club" members="12 members" />
      <Tile x={18} y={268} name="Makers" members="31 members" />
      <Tile x={150} y={268} name="Sound Baths" members="18 members" accent />
    </RenderFrame>
  )
}

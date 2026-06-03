// Circles render — a desktop "circles page" mockup (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label } from './frame'

function Tile({ x, y, name, members, accent }: { x: number; y: number; name: string; members: string; accent?: boolean }) {
  const cx = x + 60
  return (
    <>
      <InnerCard x={x} y={y} w={120} h={104} />
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={cx - 12} cy={y + 32} r={14} fill="currentColor" />
      </g>
      <g className="text-primary-bg">
        <circle cx={cx + 8} cy={y + 32} r={11} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.4}>
        <circle cx={cx + 26} cy={y + 32} r={9} fill="currentColor" />
      </g>
      <Label x={cx} y={y + 64} size={10} weight={700} anchor="middle">{name}</Label>
      <Label x={cx} y={y + 78} size={8} weight={500} tone="text-subtle" anchor="middle">{members}</Label>
      <g className={accent ? 'text-primary' : 'text-border-strong'} opacity={accent ? 1 : 0.4}>
        <rect x={cx - 24} y={y + 86} width={48} height={14} rx={7} fill="currentColor" />
      </g>
      {accent && <Label x={cx} y={y + 96} size={8} weight={700} tone="text-on-primary" anchor="middle">Joined</Label>}
    </>
  )
}

export function CirclesRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency circles" title="Circles" active={1} animate={animate}>
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">SMALL ROOMS NEAR YOU</Label>
      <Tile x={140} y={106} name="Sunrise Hikers" members="24 members" accent />
      <Tile x={268} y={106} name="Book Club" members="12 members" />
      <Tile x={396} y={106} name="Makers" members="31 members" />
      <Tile x={140} y={222} name="Sound Baths" members="18 members" />
      <Tile x={268} y={222} name="Cold Plunge" members="9 members" accent />
      <Tile x={396} y={222} name="Potluck" members="22 members" />
    </RenderFrame>
  )
}

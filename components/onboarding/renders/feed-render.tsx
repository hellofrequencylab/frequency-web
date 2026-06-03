// Feed render — a 9:16 mini "feed page" (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Bar, Label } from './frame'

function Post({ y, name, meta, accent }: { y: number; name: string; meta: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={18} y={y} w={252} h={120} />
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={46} cy={y + 28} r={15} fill="currentColor" />
      </g>
      <Label x={70} y={y + 26} size={12} weight={700}>{name}</Label>
      <Label x={70} y={y + 41} size={9} weight={500} tone="text-subtle">{meta}</Label>
      <Bar x={36} y={y + 58} w={216} />
      <Bar x={36} y={y + 73} w={168} />
      {/* reactions */}
      <g className="text-primary">
        <rect x={36} y={y + 90} width={46} height={16} rx={8} fill="currentColor" />
      </g>
      <Label x={59} y={y + 101} size={9} weight={700} tone="text-on-primary" anchor="middle">♥ 12</Label>
      <g className="text-border-strong" opacity={0.4}>
        <rect x={90} y={y + 90} width={40} height={16} rx={8} fill="currentColor" />
      </g>
    </>
  )
}

export function FeedRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of the Frequency feed" title="Feed" animate={animate}>
      {/* composer */}
      <InnerCard x={18} y={78} w={252} h={40} tone="text-marketing-canvas" />
      <g className="text-primary-bg">
        <circle cx={42} cy={98} r={12} fill="currentColor" />
      </g>
      <Label x={62} y={102} size={11} weight={500} tone="text-subtle">Share something…</Label>

      <Post y={130} name="Maya R." meta="2h · near you" accent />
      <Post y={262} name="Theo K." meta="4h · Riverside" />
      <Post y={394} name="Priya N." meta="6h · Downtown" />
    </RenderFrame>
  )
}

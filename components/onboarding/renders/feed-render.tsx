// Feed render — a desktop "feed page" mockup (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Bar, Label } from './frame'

function Post({ y, name, meta, accent }: { y: number; name: string; meta: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={140} y={y} w={376} h={66} />
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={166} cy={y + 26} r={13} fill="currentColor" />
      </g>
      <Label x={188} y={y + 24} size={11} weight={700}>{name}</Label>
      <Label x={188} y={y + 38} size={9} weight={500} tone="text-subtle">{meta}</Label>
      <Bar x={188} y={y + 50} w={250} />
      <g className="text-primary">
        <rect x={452} y={y + 16} width={50} height={16} rx={8} fill="currentColor" />
      </g>
      <Label x={477} y={y + 27} size={9} weight={700} tone="text-on-primary" anchor="middle">♥ 12</Label>
    </>
  )
}

export function FeedRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of the Frequency feed" title="Feed" active={0} animate={animate}>
      {/* composer */}
      <InnerCard x={140} y={84} w={376} h={34} />
      <g className="text-primary-bg">
        <circle cx={162} cy={101} r={10} fill="currentColor" />
      </g>
      <Label x={182} y={105} size={10} weight={500} tone="text-subtle">Share something with your people…</Label>

      <Post y={128} name="Maya R." meta="2h · near you" accent />
      <Post y={202} name="Theo K." meta="4h · Riverside" />
      <Post y={276} name="Priya N." meta="6h · Downtown" />
    </RenderFrame>
  )
}

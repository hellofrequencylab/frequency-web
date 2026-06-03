// Events render — a desktop "events page" mockup (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label } from './frame'

function Row({ y, day, mon, title, meta, accent }: { y: number; day: string; mon: string; title: string; meta: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={140} y={y} w={376} h={66} />
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <rect x={156} y={y + 13} width={40} height={40} rx={10} fill="currentColor" />
      </g>
      <Label x={176} y={y + 30} size={14} weight={800} tone={accent ? 'text-on-primary' : 'text-primary-strong'} anchor="middle">{day}</Label>
      <Label x={176} y={y + 44} size={7} weight={700} tone={accent ? 'text-on-primary' : 'text-primary-strong'} anchor="middle">{mon}</Label>
      <Label x={212} y={y + 30} size={11} weight={700}>{title}</Label>
      <Label x={212} y={y + 45} size={9} weight={500} tone="text-subtle">{meta}</Label>
      <g className="text-primary-bg">
        <circle cx={454} cy={y + 33} r={9} fill="currentColor" />
        <circle cx={470} cy={y + 33} r={9} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.4}>
        <circle cx={486} cy={y + 33} r={9} fill="currentColor" />
      </g>
    </>
  )
}

export function EventsRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency events" title="Events" active={2} animate={animate}>
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">THIS WEEK · IN PERSON</Label>
      <Row y={106} day="12" mon="JUN" title="Thursday Run Club" meta="6:00 PM · Riverside" accent />
      <Row y={180} day="14" mon="JUN" title="Sunset Sound Bath" meta="7:30 PM · The Lab" />
      <Row y={254} day="16" mon="JUN" title="Makers Meetup" meta="5:00 PM · Downtown" />
    </RenderFrame>
  )
}

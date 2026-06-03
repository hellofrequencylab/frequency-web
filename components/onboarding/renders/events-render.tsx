// Events render — a 9:16 mini "events page" (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label } from './frame'

function EventRow({ y, day, mon, title, meta, accent }: { y: number; day: string; mon: string; title: string; meta: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={18} y={y} w={252} h={92} />
      {/* date block */}
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <rect x={34} y={y + 18} width={56} height={56} rx={14} fill="currentColor" />
      </g>
      <Label x={62} y={y + 42} size={20} weight={800} tone={accent ? 'text-on-primary' : 'text-primary-strong'} anchor="middle">{day}</Label>
      <Label x={62} y={y + 58} size={9} weight={700} tone={accent ? 'text-on-primary' : 'text-primary-strong'} anchor="middle">{mon}</Label>
      {/* title + meta */}
      <Label x={104} y={y + 36} size={12} weight={700}>{title}</Label>
      <Label x={104} y={y + 54} size={9} weight={500} tone="text-subtle">{meta}</Label>
      {/* attendees */}
      <g className="text-primary-bg">
        <circle cx={112} cy={y + 72} r={8} fill="currentColor" />
        <circle cx={126} cy={y + 72} r={8} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.4}>
        <circle cx={140} cy={y + 72} r={8} fill="currentColor" />
      </g>
    </>
  )
}

export function EventsRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency events" title="Events" animate={animate}>
      <Label x={18} y={92} size={10} weight={600} tone="text-subtle">THIS WEEK · IN PERSON</Label>
      <EventRow y={104} day="12" mon="JUN" title="Thursday Run Club" meta="6:00 PM · Riverside" accent />
      <EventRow y={208} day="14" mon="JUN" title="Sunset Sound Bath" meta="7:30 PM · The Lab" />
      <EventRow y={312} day="16" mon="JUN" title="Makers Meetup" meta="5:00 PM · Downtown" />
    </RenderFrame>
  )
}

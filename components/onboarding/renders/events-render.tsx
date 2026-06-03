// Events render — the beta-induction "vector render" for Events (ADR-068).
// TEMPORARY: deleted with the induction at launch. Disposable inline SVG.

import { RenderFrame, InnerCard, Bar } from './frame'

/** One event row: a date block + title/meta + a small avatar stack. */
function EventRow({ y, accent = false }: { y: number; accent?: boolean }) {
  return (
    <>
      <InnerCard x={24} y={y} w={312} h={96} />
      {/* date block */}
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <rect x={40} y={y + 18} width={60} height={60} rx={14} fill="currentColor" />
      </g>
      {/* day number inside the block */}
      <g className={accent ? 'text-on-primary' : 'text-primary-strong'} opacity={0.9}>
        <rect x={56} y={y + 30} width={28} height={9} rx={4.5} fill="currentColor" />
        <rect x={52} y={y + 48} width={36} height={14} rx={5} fill="currentColor" />
      </g>
      {/* title + meta */}
      <Bar x={120} y={y + 26} w={170} h={10} o={0.7} />
      <Bar x={120} y={y + 46} w={120} h={8} o={0.45} />
      {/* attendee avatar stack */}
      <g className="text-primary-bg">
        <circle cx={130} cy={y + 72} r={9} fill="currentColor" />
        <circle cx={146} cy={y + 72} r={9} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.45}>
        <circle cx={162} cy={y + 72} r={9} fill="currentColor" />
      </g>
    </>
  )
}

export function EventsRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency events" animate={animate}>
      <EventRow y={86} accent />
      <EventRow y={198} />
      <EventRow y={310} />
    </RenderFrame>
  )
}

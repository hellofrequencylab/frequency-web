// Feed render — the beta-induction "vector render" for the Feed (ADR-068).
// TEMPORARY: deleted with the induction at launch. Disposable inline SVG.

import { RenderFrame, InnerCard, Bar } from './frame'

/** One stacked post card: avatar, two text lines, a reaction pill. */
function PostCard({ y, accent = false }: { y: number; accent?: boolean }) {
  return (
    <>
      <InnerCard x={24} y={y} w={312} h={104} />
      {/* avatar */}
      <g className="text-primary-bg">
        <circle cx={52} cy={y + 30} r={16} fill="currentColor" />
      </g>
      <Bar x={78} y={y + 18} w={120} h={9} o={0.7} />
      <Bar x={78} y={y + 34} w={68} h={7} o={0.4} />
      {/* body lines */}
      <Bar x={40} y={y + 56} w={280} />
      <Bar x={40} y={y + 72} w={210} />
      {/* reaction pills */}
      <g className={accent ? 'text-primary' : 'text-border-strong'} opacity={accent ? 1 : 0.45}>
        <rect x={40} y={y + 88} width={40} height={12} rx={6} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.45}>
        <rect x={88} y={y + 88} width={40} height={12} rx={6} fill="currentColor" />
      </g>
    </>
  )
}

export function FeedRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of the Frequency feed" animate={animate}>
      <PostCard y={86} accent />
      <PostCard y={206} />
      <PostCard y={326} />
    </RenderFrame>
  )
}

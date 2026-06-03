// Circles render — the beta-induction "vector render" for Circles (ADR-068).
// TEMPORARY: deleted with the induction at launch. Disposable inline SVG.

import { RenderFrame, InnerCard, Bar } from './frame'

/** One circle tile: a cluster of member avatars + a name/meta line. */
function CircleTile({ x, y, accent = false }: { x: number; y: number; accent?: boolean }) {
  return (
    <>
      <InnerCard x={x} y={y} w={138} h={150} />
      {/* overlapping avatar cluster */}
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={x + 46} cy={y + 50} r={22} fill="currentColor" />
      </g>
      <g className="text-primary-bg">
        <circle cx={x + 76} cy={y + 50} r={18} fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity={0.45}>
        <circle cx={x + 100} cy={y + 50} r={14} fill="currentColor" />
      </g>
      {/* name + meta */}
      <Bar x={x + 22} y={y + 92} w={94} h={9} o={0.7} />
      <Bar x={x + 22} y={y + 110} w={60} h={7} o={0.4} />
      {/* join chip */}
      <g className={accent ? 'text-primary' : 'text-border-strong'} opacity={accent ? 1 : 0.4}>
        <rect x={x + 22} y={y + 124} width={48} height={12} rx={6} fill="currentColor" />
      </g>
    </>
  )
}

export function CirclesRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency circles" animate={animate}>
      <CircleTile x={24} y={86} accent />
      <CircleTile x={198} y={86} />
      <CircleTile x={24} y={256} />
      <CircleTile x={198} y={256} accent />
    </RenderFrame>
  )
}

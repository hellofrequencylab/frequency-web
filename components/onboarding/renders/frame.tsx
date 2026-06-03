// Shared frame for the beta-induction section "renders" (ADR-068).
// TEMPORARY — deleted with the induction at launch. DAWN tokens only, via
// currentColor + text-* classes, so renders theme (light/dark) for free and
// never hardcode hex. Motion is gated by motion-safe (prefers-reduced-motion).

import type { ReactNode } from 'react'

/**
 * A consistent "device" shell so the three renders read as one family
 * (cohesive, not disparate). Children draw inside the card on a warm fill.
 */
export function RenderFrame({
  label,
  children,
  animate = true,
}: {
  label: string
  children: ReactNode
  animate?: boolean
}) {
  return (
    <svg
      viewBox="0 0 360 460"
      role="img"
      aria-label={label}
      className="h-auto w-full max-w-[360px]"
    >
      {/* Card surface + border */}
      <g className="text-surface">
        <rect x="6" y="6" width="348" height="448" rx="28" fill="currentColor" />
      </g>
      <g className="text-border-strong">
        <rect x="6" y="6" width="348" height="448" rx="28" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>

      {/* Header: brand dot + title bar + a soft pill */}
      <g className="text-primary">
        <circle cx="36" cy="42" r="9" fill="currentColor" />
      </g>
      <g className="text-border-strong" opacity="0.55">
        <rect x="54" y="37" width="92" height="9" rx="4.5" fill="currentColor" />
      </g>
      <g className="text-primary-bg">
        <rect x="306" y="32" width="32" height="18" rx="9" fill="currentColor" />
      </g>
      <g className="text-border">
        <line x1="22" y1="66" x2="338" y2="66" stroke="currentColor" strokeWidth="1.5" />
      </g>

      {/* Content — eased in on mount unless reduced-motion */}
      <g className={animate ? 'motion-safe:animate-[slideUp_0.55s_ease-out_both]' : undefined}>
        {children}
      </g>
    </svg>
  )
}

/** A faint warm card used as the building block inside each render. */
export function InnerCard(props: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <g className="text-marketing-canvas">
        <rect x={props.x} y={props.y} width={props.w} height={props.h} rx="16" fill="currentColor" />
      </g>
      <g className="text-border">
        <rect x={props.x} y={props.y} width={props.w} height={props.h} rx="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </>
  )
}

/** A muted text line (placeholder copy). */
export function Bar({ x, y, w, h = 8, o = 0.5 }: { x: number; y: number; w: number; h?: number; o?: number }) {
  return (
    <g className="text-border-strong" opacity={o}>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="currentColor" />
    </g>
  )
}

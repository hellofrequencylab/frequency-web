// Shared 9:16 "mini web page" frame for the beta-induction renders (ADR-068).
// TEMPORARY — deleted with the induction at launch. DAWN tokens only (currentColor
// + text-* classes) so it themes for free. Motion gated by motion-safe.

import type { ReactNode } from 'react'

/** A phone-shaped 9:16 device with a page header, so renders read as real pages. */
export function RenderFrame({
  label,
  title,
  children,
  animate = true,
}: {
  label: string
  title: string
  children: ReactNode
  animate?: boolean
}) {
  return (
    <svg viewBox="0 0 288 512" role="img" aria-label={label} className="h-auto w-full max-w-[288px]">
      {/* Device surface + border */}
      <g className="text-surface">
        <rect x="3" y="3" width="282" height="506" rx="30" fill="currentColor" />
      </g>
      <g className="text-border-strong">
        <rect x="3" y="3" width="282" height="506" rx="30" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>

      {/* Page header: brand dot + section title + a menu glyph */}
      <g className="text-primary">
        <circle cx="32" cy="40" r="8" fill="currentColor" />
      </g>
      <Label x={48} y={45} size={15} weight={800}>{title}</Label>
      <g className="text-border-strong" opacity="0.6">
        <circle cx="250" cy="36" r="2" fill="currentColor" />
        <circle cx="258" cy="36" r="2" fill="currentColor" />
        <circle cx="266" cy="36" r="2" fill="currentColor" />
      </g>
      <g className="text-border">
        <line x1="20" y1="64" x2="268" y2="64" stroke="currentColor" strokeWidth="1.5" />
      </g>

      <g className={animate ? 'motion-safe:animate-[slideUp_0.55s_ease-out_both]' : undefined}>
        {children}
      </g>
    </svg>
  )
}

/** SVG text label, themed via a DAWN text-* class. */
export function Label({
  x,
  y,
  children,
  size = 11,
  weight = 600,
  tone = 'text-text',
  anchor = 'start',
  opacity = 1,
}: {
  x: number
  y: number
  children: ReactNode
  size?: number
  weight?: number
  tone?: string
  anchor?: 'start' | 'middle' | 'end'
  opacity?: number
}) {
  return (
    <g className={tone} opacity={opacity}>
      <text x={x} y={y} fontSize={size} fontWeight={weight} fill="currentColor" textAnchor={anchor} style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
        {children}
      </text>
    </g>
  )
}

/** A faint warm card used as the building block inside each render. */
export function InnerCard(props: { x: number; y: number; w: number; h: number; tone?: string }) {
  return (
    <>
      <g className={props.tone ?? 'text-marketing-canvas'}>
        <rect x={props.x} y={props.y} width={props.w} height={props.h} rx="14" fill="currentColor" />
      </g>
      <g className="text-border">
        <rect x={props.x} y={props.y} width={props.w} height={props.h} rx="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </>
  )
}

/** A muted placeholder line. */
export function Bar({ x, y, w, h = 7, o = 0.5 }: { x: number; y: number; w: number; h?: number; o?: number }) {
  return (
    <g className="text-border-strong" opacity={o}>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="currentColor" />
    </g>
  )
}

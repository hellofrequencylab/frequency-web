// Shared desktop "website screen" mockup frame for the beta-induction renders
// (ADR-068). TEMPORARY — deleted with the induction at launch. A landscape
// browser window (chrome + sidebar nav + content area). DAWN tokens only.

import type { ReactNode } from 'react'

const NAV = ['Feed', 'Circles', 'Events', 'People']

/** A landscape browser window with chrome + a left nav; children fill the page body. */
export function RenderFrame({
  label,
  title,
  active = 0,
  children,
  animate = true,
}: {
  label: string
  title: string
  active?: number
  children: ReactNode
  animate?: boolean
}) {
  return (
    <svg viewBox="0 0 540 348" role="img" aria-label={label} className="h-auto w-full">
      {/* Window */}
      <g className="text-surface">
        <rect x="2" y="2" width="536" height="344" rx="18" fill="currentColor" />
      </g>
      <g className="text-border-strong">
        <rect x="2" y="2" width="536" height="344" rx="18" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>

      {/* Browser chrome: traffic lights + address pill */}
      <g className="text-border-strong" opacity="0.55">
        <circle cx="24" cy="22" r="4" fill="currentColor" />
        <circle cx="38" cy="22" r="4" fill="currentColor" />
        <circle cx="52" cy="22" r="4" fill="currentColor" />
      </g>
      <g className="text-marketing-canvas">
        <rect x="150" y="13" width="240" height="18" rx="9" fill="currentColor" />
      </g>
      <Label x={270} y={26} size={9} weight={600} tone="text-subtle" anchor="middle">frequencylocal.com</Label>
      <g className="text-border">
        <line x1="2" y1="44" x2="538" y2="44" stroke="currentColor" strokeWidth="1.5" />
      </g>

      {/* Sidebar */}
      <g className="text-marketing-canvas">
        <rect x="2" y="45" width="118" height="301" fill="currentColor" />
      </g>
      <g className="text-border">
        <line x1="120" y1="44" x2="120" y2="346" stroke="currentColor" strokeWidth="1.5" />
      </g>
      <g className="text-primary">
        <circle cx="24" cy="68" r="7" fill="currentColor" />
      </g>
      <Label x={38} y={72} size={11} weight={800}>Frequency</Label>
      {NAV.map((item, i) => {
        const ny = 104 + i * 34
        const on = i === active
        return (
          <g key={item}>
            {on && (
              <g className="text-primary-bg">
                <rect x="12" y={ny - 14} width="96" height="26" rx="8" fill="currentColor" />
              </g>
            )}
            <g className={on ? 'text-primary' : 'text-border-strong'} opacity={on ? 1 : 0.6}>
              <circle cx="26" cy={ny - 1} r="4" fill="currentColor" />
            </g>
            <Label x={38} y={ny + 3} size={10} weight={on ? 700 : 500} tone={on ? 'text-primary-strong' : 'text-subtle'}>{item}</Label>
          </g>
        )
      })}

      {/* Page body */}
      <Label x={140} y={70} size={15} weight={800}>{title}</Label>
      <g className={animate ? 'motion-safe:animate-[slideUp_0.55s_ease-out_both]' : undefined}>
        {children}
      </g>
    </svg>
  )
}

/** SVG text label, themed via a DAWN text-* class. */
export function Label({
  x, y, children, size = 11, weight = 600, tone = 'text-text', anchor = 'start', opacity = 1,
}: {
  x: number; y: number; children: ReactNode; size?: number; weight?: number; tone?: string; anchor?: 'start' | 'middle' | 'end'; opacity?: number
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
        <rect x={props.x} y={props.y} width={props.w} height={props.h} rx="12" fill="currentColor" />
      </g>
      <g className="text-border">
        <rect x={props.x} y={props.y} width={props.w} height={props.h} rx="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </>
  )
}

/** A muted placeholder line. */
export function Bar({ x, y, w, h = 6, o = 0.5 }: { x: number; y: number; w: number; h?: number; o?: number }) {
  return (
    <g className="text-border-strong" opacity={o}>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="currentColor" />
    </g>
  )
}

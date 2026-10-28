// THE HUB DIAGRAM on /system (LIVE-1562): four front doors feed one list of people, and six tools run off it.
// Inline SVG with token colors only (var(--fq-*)), no hex, no theme CSS. Server component. The same data
// renders as a text list under the picture, so a screen reader and a crawler read the diagram too.
import { SYSTEM_HUB } from './system-data'

const INK = 'var(--fq-text-strong)'
const MUTED = 'var(--fq-text-muted)'
const HAIR = 'var(--fq-border-hair)'
const CARD = 'var(--fq-surface-card)'
const SIDE = 'var(--fq-side)'
const WING = 'var(--fq-wing)'
const DISPLAY = 'var(--fq-font-display)'
const SANS = 'var(--fq-font-sans)'

function Box({ x, y, w, h, title, line, accent }: { x: number; y: number; w: number; h: number; title: string; line: string; accent: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={CARD} stroke={HAIR} strokeWidth={1.5} />
      <rect x={x} y={y + 14} width={4} height={h - 28} rx={2} fill={accent} />
      <text x={x + 18} y={y + 26} fill={INK} fontFamily={DISPLAY} fontWeight={600} fontSize={14} letterSpacing="-.02em">
        {title}
      </text>
      <text x={x + 18} y={y + 45} fill={MUTED} fontFamily={SANS} fontSize={12}>
        {line}
      </text>
    </g>
  )
}

export function SystemHub() {
  const doors = SYSTEM_HUB.doors
  const tools = SYSTEM_HUB.tools
  const doorH = 60
  const doorGap = 16
  const doorTop = 70
  const toolH = 60
  const toolGap = 10
  const toolTop = 20
  const cx = 480
  const cy = 240
  return (
    <figure data-system-hub>
      <svg viewBox="0 0 960 480" role="img" aria-labelledby="sys-hub-title" style={{ display: 'block', inlineSize: 'auto' }}>
        <title id="sys-hub-title">{SYSTEM_HUB.heading}</title>
        <rect x={8} y={8} width={944} height={464} rx={28} fill="none" stroke={HAIR} strokeWidth={1.5} strokeDasharray="6 8" />
        <text x={32} y={38} fill={MUTED} fontFamily={DISPLAY} fontWeight={600} fontSize={12} letterSpacing=".14em">
          ONE CONSOLE
        </text>
        <text x={40} y={doorTop - 14} fill={SIDE} fontFamily={DISPLAY} fontWeight={600} fontSize={11} letterSpacing=".14em">
          BE FOUND
        </text>
        {doors.map(([title, line], i) => {
          const y = doorTop + i * (doorH + doorGap)
          return (
            <g key={title}>
              <Box x={40} y={y} w={230} h={doorH} title={title} line={line} accent={SIDE} />
              <path d={`M270 ${y + doorH / 2} C 330 ${y + doorH / 2}, 330 ${cy}, ${cx - 90} ${cy}`} fill="none" stroke={HAIR} strokeWidth={1.5} />
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={88} fill={CARD} stroke={SIDE} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={100} fill="none" stroke={HAIR} strokeWidth={1} strokeDasharray="3 6" />
        <text x={cx} y={cy - 10} textAnchor="middle" fill={INK} fontFamily={DISPLAY} fontWeight={600} fontSize={18} letterSpacing="-.03em">
          {SYSTEM_HUB.people[0]}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={MUTED} fontFamily={SANS} fontSize={12}>
          {SYSTEM_HUB.people[1]}
        </text>
        <text x={cx} y={cy + 30} textAnchor="middle" fill={MUTED} fontFamily={SANS} fontSize={12}>
          {SYSTEM_HUB.people[2]}
        </text>
        <text x={690} y={toolTop - 2} fill={WING} fontFamily={DISPLAY} fontWeight={600} fontSize={11} letterSpacing=".14em">
          RUNS OFF IT
        </text>
        {tools.map(([title, line], i) => {
          const y = toolTop + 10 + i * (toolH + toolGap)
          return (
            <g key={title}>
              <path d={`M${cx + 90} ${cy} C 640 ${cy}, 640 ${y + toolH / 2}, 690 ${y + toolH / 2}`} fill="none" stroke={HAIR} strokeWidth={1.5} />
              <Box x={690} y={y} w={230} h={toolH} title={title} line={line} accent={WING} />
            </g>
          )
        })}
      </svg>
      <figcaption className="pb-note">
        <b>Be found:</b> {doors.map((d) => d[0]).join(', ')}. <b>One list:</b> {SYSTEM_HUB.people[0].toLowerCase()}, {SYSTEM_HUB.people[1]}.{' '}
        <b>Runs off it:</b> {tools.map((t) => t[0]).join(', ')}.
      </figcaption>
    </figure>
  )
}

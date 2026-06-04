// On-brand abstract vector art: the "frequency" (radiating arcs / ripples) and
// "circle" (rings, a constellation of people) motifs. Token-only (uses currentColor,
// so color it with `text-primary` etc.), decorative (aria-hidden), and resolution
// independent. Use behind or beside sections to add texture without photography.

type Props = { className?: string }

// Radiating concentric arcs — a signal/frequency emanating from a point.
export function FrequencyArcs({ className = '' }: Props) {
  return (
    <svg viewBox="0 0 200 130" fill="none" aria-hidden className={className}>
      {[24, 46, 68, 90, 112].map((r, i) => (
        <path
          key={r}
          d={`M ${100 - r} 122 A ${r} ${r} 0 0 1 ${100 + r} 122`}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity={0.85 - i * 0.15}
        />
      ))}
      <circle cx="100" cy="122" r="4" fill="currentColor" />
    </svg>
  )
}

// Concentric rings — a circle widening, or a ripple on water.
export function RippleRings({ className = '' }: Props) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden className={className}>
      {[26, 48, 70, 92].map((r, i) => (
        <circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          stroke="currentColor"
          strokeWidth="1.75"
          opacity={0.8 - i * 0.16}
        />
      ))}
      <circle cx="100" cy="100" r="6" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

// A small constellation of people: nodes joined by thin links (a circle/network).
export function CircleConstellation({ className = '' }: Props) {
  const nodes: [number, number, number][] = [
    [42, 64, 7],
    [96, 40, 6],
    [150, 70, 7],
    [70, 116, 6],
    [128, 132, 7],
    [168, 116, 5],
  ]
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 4],
    [2, 4],
    [2, 5],
  ]
  return (
    <svg viewBox="0 0 200 180" fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="1" opacity="0.3">
        {links.map(([a, b], i) => (
          <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
        ))}
      </g>
      {nodes.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="currentColor" opacity="0.9" />
      ))}
    </svg>
  )
}

// A soft, organic amber blob, for warm background texture behind a section.
export function OrganicBlob({ className = '' }: Props) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden className={className}>
      <path
        d="M44 64C58 34 104 22 136 38c30 15 46 52 40 86-6 33-38 58-72 56-37-2-62-30-66-62-3-22 4-40 6-54Z"
        fill="currentColor"
      />
    </svg>
  )
}

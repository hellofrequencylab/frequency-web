// Check-in render — a desktop "door check-in" mockup (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label } from './frame'

// A tiny QR-ish glyph: three finder squares + a scatter of modules. Purely decorative.
function QrGlyph({ x, y, s }: { x: number; y: number; s: number }) {
  const cell = s / 11
  const modules = [
    [4, 1], [6, 1], [4, 3], [8, 3], [1, 5], [3, 5], [5, 5], [7, 5], [9, 5],
    [4, 6], [6, 6], [8, 6], [5, 7], [7, 7], [9, 7], [4, 9], [6, 9], [8, 9], [10, 9],
  ]
  const finder = (fx: number, fy: number) => (
    <g key={`f${fx}-${fy}`}>
      <rect x={x + fx * cell} y={y + fy * cell} width={cell * 3} height={cell * 3} rx={cell * 0.6} fill="none" stroke="currentColor" strokeWidth={cell * 0.9} />
      <rect x={x + (fx + 1) * cell} y={y + (fy + 1) * cell} width={cell} height={cell} rx={cell * 0.3} fill="currentColor" />
    </g>
  )
  return (
    <g className="text-primary-strong">
      {finder(0, 0)}
      {finder(8, 0)}
      {finder(0, 8)}
      {modules.map(([mx, my], i) => (
        <rect key={i} x={x + mx * cell} y={y + my * cell} width={cell} height={cell} rx={cell * 0.3} fill="currentColor" />
      ))}
    </g>
  )
}

function Person({ y, name, accent }: { y: number; name: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={336} y={y} w={180} h={40} />
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={358} cy={y + 20} r={11} fill="currentColor" />
      </g>
      <Label x={378} y={y + 24} size={10} weight={700}>{name}</Label>
      <g className="text-success">
        <path d={`M${478} ${y + 19}l4 4 8-9`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  )
}

export function CheckinRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency check-in" title="Check in" active={2} animate={animate}>
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">DOOR · TONIGHT</Label>

      {/* QR card, left */}
      <InnerCard x={140} y={106} w={180} h={180} />
      <QrGlyph x={172} y={130} s={116} />
      <Label x={230} y={272} size={10} weight={700} tone="text-primary-strong" anchor="middle">Scan to check in</Label>

      {/* Roster, right */}
      <Label x={336} y={122} size={9} weight={600} tone="text-subtle">CHECKED IN · 42</Label>
      <Person y={132} name="Maya R." accent />
      <Person y={180} name="Theo K." />
      <Person y={228} name="Priya N." />

      <g className="text-primary">
        <rect x={336} y={280} width={180} height={38} rx={12} fill="currentColor" />
      </g>
      <Label x={426} y={304} size={12} weight={800} tone="text-on-primary" anchor="middle">Checked in ✓</Label>
    </RenderFrame>
  )
}

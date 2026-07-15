// Tickets render — a desktop "event tickets" mockup (ADR-068). TEMPORARY, disposable SVG.
// Ticket tiers on the left, a scannable QR pass on the right — the two halves of "sell it, scan it".

import { RenderFrame, InnerCard, Label } from './frame'

// A tiny QR-ish glyph: three finder squares + a scatter of modules. Purely decorative.
// (Local copy — these induction mocks are disposable pre-launch art; kept self-contained.)
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

// One ticket tier: name + price, with a "sold" progress bar under it.
function Tier({ y, name, price, sold, accent }: { y: number; name: string; price: string; sold: number; accent?: boolean }) {
  return (
    <>
      <InnerCard x={140} y={y} w={176} h={40} tone={accent ? 'text-primary-bg' : undefined} />
      <Label x={156} y={y + 20} size={11} weight={700}>{name}</Label>
      <Label x={300} y={y + 20} size={12} weight={800} tone="text-primary-strong" anchor="end">{price}</Label>
      {/* sold bar */}
      <g className="text-border-strong" opacity={0.35}>
        <rect x={156} y={y + 28} width={144} height={5} rx={2.5} fill="currentColor" />
      </g>
      <g className="text-primary">
        <rect x={156} y={y + 28} width={Math.max(6, Math.round(144 * sold))} height={5} rx={2.5} fill="currentColor" />
      </g>
    </>
  )
}

export function TicketsRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency tickets" title="Tickets" active={2} animate={animate}>
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">SUNSET SOUND BATH · SAT</Label>

      {/* Tiers, left */}
      <Tier y={106} name="General" price="$20" sold={0.8} accent />
      <Tier y={152} name="VIP" price="$45" sold={0.55} />
      <Tier y={198} name="Door" price="$25" sold={0.2} />

      {/* payout chip */}
      <g className="text-success-bg">
        <rect x={140} y={250} width={176} height={34} rx={12} fill="currentColor" />
      </g>
      <Label x={228} y={271} size={11} weight={700} tone="text-success" anchor="middle">Payout $1,240 · low fees</Label>

      {/* QR pass, right */}
      <InnerCard x={336} y={106} w={180} h={180} />
      <QrGlyph x={368} y={130} s={116} />
      <Label x={426} y={272} size={10} weight={700} tone="text-primary-strong" anchor="middle">Scan to enter</Label>
    </RenderFrame>
  )
}

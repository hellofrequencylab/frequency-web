// Donate render — a desktop "fundraiser page" mockup (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label, Bar } from './frame'

function Amount({ x, value, accent }: { x: number; value: string; accent?: boolean }) {
  const cx = x + 42
  return (
    <>
      <InnerCard x={x} y={214} w={85} h={40} tone={accent ? 'text-primary' : undefined} />
      <Label x={cx} y={239} size={13} weight={800} tone={accent ? 'text-on-primary' : 'text-text'} anchor="middle">{value}</Label>
    </>
  )
}

export function DonateRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency fundraising" title="Fundraiser" active={3} animate={animate}>
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">FUNDRAISER · JUNE</Label>

      {/* Progress card */}
      <InnerCard x={140} y={106} w={376} h={90} />
      <Label x={160} y={138} size={18} weight={800} tone="text-primary-strong">$8,400</Label>
      <Label x={244} y={138} size={11} weight={600} tone="text-subtle">raised of $10,000</Label>
      {/* progress track + accent fill (84%) */}
      <Bar x={160} y={152} w={336} h={10} o={0.35} />
      <g className="text-primary">
        <rect x={160} y={152} width={282} height={10} rx={5} fill="currentColor" />
      </g>
      <Label x={160} y={184} size={9} weight={700} tone="text-primary-strong">84% there</Label>
      <Label x={496} y={184} size={9} weight={500} tone="text-subtle" anchor="end">126 gifts</Label>

      {/* Gift amounts */}
      <Label x={140} y={206} size={9} weight={600} tone="text-subtle">CHOOSE A GIFT</Label>
      <Amount x={140} value="$25" />
      <Amount x={237} value="$50" accent />
      <Amount x={334} value="$100" />
      <Amount x={431} value="$250" />

      {/* Give CTA */}
      <g className="text-primary">
        <rect x={140} y={276} width={376} height={40} rx={12} fill="currentColor" />
      </g>
      <Label x={328} y={301} size={12} weight={800} tone="text-on-primary" anchor="middle">Give $50 ♥</Label>
    </RenderFrame>
  )
}

import { Heart } from 'lucide-react'

// One small pill that marks a member as a **Supporter** — the pay-more entitlement
// tier above Crew (profiles.membership_tier = 'supporter'). It's the cosmetic
// thank-you for chipping in beyond the standard membership, so it reads as warm and
// endorsed (filled signal token, a little heart) without shouting over a member's
// rank or role. Reuses the badge convention (RoleBadge / DemoBadge) so a Supporter
// reads identically everywhere it shows up — profile header, people cards, post flair.
//
// Gate the render on the DISPLAYED profile's tier, not the viewer's:
//   {tier === 'supporter' && <SupporterBadge />}
export function SupporterBadge({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      title="Supporter. Chips in beyond membership to keep Frequency running."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-signal/30 bg-signal-bg/60 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-signal-strong ${className}`}
    >
      <Heart className="h-2.5 w-2.5 fill-signal-strong text-signal-strong" aria-hidden />
      {!compact && 'Supporter'}
    </span>
  )
}

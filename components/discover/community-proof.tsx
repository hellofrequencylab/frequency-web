import { Users, Sparkles, CalendarDays } from 'lucide-react'
import { SOCIAL_PROOF_FLOOR, FOUNDING_PLACE } from '@/lib/site'

// Live social-proof bar for public /discover surfaces. Reuses the existing
// getPublicCounts() RPCs (members + active circles) plus the already-fetched
// upcoming-event count — no new data, no client JS. It mirrors the honest
// framing the homepage and discover hero already use: above SOCIAL_PROOF_FLOOR
// we show real numbers; below it we show qualitative founding-stage copy,
// because a brand-new community showing "0 members" is anti-persuasive
// (STUDIO-REVIEW P0). Drop it in just above a conversion ask so a warm visitor
// sees the room is real before we make the offer.
export function CommunityProof({
  members,
  circles,
  events,
}: {
  members: number
  circles: number
  events: number
}) {
  const hasProof = members >= SOCIAL_PROOF_FLOOR

  if (!hasProof) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-center shadow-sm">
        <p className="text-sm text-muted leading-relaxed">
          The first Circles are taking root in{' '}
          <strong className="text-text">{FOUNDING_PLACE}</strong>. The founding members are
          shaping what this becomes — come be one of them.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-5 shadow-sm">
      <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-primary">
        Already happening in {FOUNDING_PLACE}
      </p>
      <dl className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        <ProofStat icon={<Users className="h-4 w-4" aria-hidden />} value={members} label="members" />
        <ProofStat icon={<Sparkles className="h-4 w-4" aria-hidden />} value={circles} label="circles" />
        <ProofStat
          icon={<CalendarDays className="h-4 w-4" aria-hidden />}
          value={events}
          label={events === 1 ? 'upcoming event' : 'upcoming events'}
        />
      </dl>
    </div>
  )
}

function ProofStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary">
        {icon}
      </span>
      <div className="text-left leading-tight">
        <dd className="text-xl font-bold text-text">{value}</dd>
        <dt className="text-xs text-muted">{label}</dt>
      </div>
    </div>
  )
}

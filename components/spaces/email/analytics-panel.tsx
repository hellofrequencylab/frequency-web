import { getSpaceEmailStats } from '@/lib/spaces/email-analytics'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'

// PER-SPACE EMAIL DELIVERABILITY PANEL (ENTITY-SPACES-BUILD §C Phase 3). A self-fetching Server
// Component the email surface embeds: a StatCard row (Sent / Delivered / Bounced / Complained) plus
// a one-line deliverability health note. It reads getSpaceEmailStats, which is gated on
// canEditProfile and fail-safe (all-zero when there is nothing to show or the caller may not read),
// so this renders safely on any surface and even before the send ledger exists.
//
// THE HEALTH NOTE: complaintRate above 0.1% (0.001) is the line in the sand for spam health. We use
// the PRESENTATION status legend - green ✅ while it stays under, ⚠️ when it crosses - so an owner
// reads their standing at a glance. The note is the only judgement the panel makes; the StatCards
// are bare numbers.
//
// COMPOSED, NOT AUTHORED: SectionHeader + StatCard + ui tokens only. No hand-rolled header/grid, no
// hex, no text-[Npx]. All copy obeys CONTENT-VOICE: plain sentences, no em/en dashes, no narrating
// the reader's feelings, passes the skeptic test (no charge / hype words).

/** The 0.1% complaint ceiling (a fraction). Above this, the panel flags a deliverability warning. */
const COMPLAINT_CEILING = 0.001

/** Format a fraction in [0,1] as a trimmed percentage, e.g. 0.0123 → "1.23%", 0 → "0%". Two
 *  decimals keep a tiny-but-nonzero complaint rate visible (0.1% is the whole point). */
function pct(fraction: number): string {
  const p = fraction * 100
  if (p === 0) return '0%'
  // Trim trailing zeros so a clean rate reads "2%" not "2.00%".
  return `${parseFloat(p.toFixed(2))}%`
}

export async function AnalyticsPanel({ spaceId }: { spaceId: string }) {
  const stats = await getSpaceEmailStats(spaceId)

  const overCeiling = stats.complaintRate > COMPLAINT_CEILING
  // The health line: ✅ while complaints stay under 0.1%, ⚠️ once they cross it. With nothing sent
  // yet, there is nothing to grade, so we say so plainly rather than imply a perfect score.
  const note =
    stats.sent === 0
      ? 'No sends yet. Deliverability shows here once you send your first email.'
      : overCeiling
        ? `⚠️ Complaints are at ${pct(stats.complaintRate)}, above the 0.1% mark inboxes watch. Slow down, send only to people who asked, and clear the opt-outs below.`
        : `✅ Complaints are at ${pct(stats.complaintRate)}, under the 0.1% mark inboxes watch. Bounces are at ${pct(stats.bounceRate)}.`

  return (
    <section aria-labelledby="space-email-deliverability">
      <SectionHeader title="Deliverability" />
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatCard label="Sent" value={stats.sent.toLocaleString()} />
        <StatCard label="Delivered" value={stats.delivered.toLocaleString()} />
        <StatCard label="Bounced" value={stats.bounced.toLocaleString()} />
        <StatCard label="Complained" value={stats.complained.toLocaleString()} />
      </div>
      <p
        id="space-email-deliverability"
        className={`mt-3 text-xs ${overCeiling ? 'font-medium text-danger' : 'text-muted'}`}
      >
        {note}
      </p>
    </section>
  )
}

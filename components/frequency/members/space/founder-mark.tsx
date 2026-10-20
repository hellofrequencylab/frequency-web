import '@/app/themes/active/space-page'
import { TIER_MARKS } from '@/lib/pricing/tier-marks'

// THE FOUNDING BUSINESS MARK, FREQUENCY (LIVE-1019). One of the first businesses on Frequency, drawn as the
// quiet frosted-glass pill with ink type and one small four-point sparkle (owner 2026-10-20: "classy, more of a
// sparkle than a lightning bolt"). It is a mark, not an action, so it never wears the pastel action fill. It sits INSIDE the cover photo's top-left corner
// (the chrome's `coverBadge` slot), where a visitor sees it before the name; the old chip crowded the title.
// Status only: the locked founder rate never reaches a public page. Server component, no JS, no reads.
// It is the cover-photo form of the shared TierChip founding_business mark: the words and title come from
// lib/pricing/tier-marks.ts, only the frosted skin differs because it sits on a photo. The look is `.fq-founder` in app/themes/frequency/space-page.css.

export function FounderMark({ className }: { className?: string }) {
  return (
    <span
      className={className ? `fq-founder ${className}` : 'fq-founder'}
      title={TIER_MARKS.founding_business.title}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5c.6 4.9 2.1 6.4 7 7-4.9.6-6.4 2.1-7 7-.6-4.9-2.1-6.4-7-7 4.9-.6 6.4-2.1 7-7Z" fill="currentColor" />
      </svg>
      {TIER_MARKS.founding_business.label}
    </span>
  )
}

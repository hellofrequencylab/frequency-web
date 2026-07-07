import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReviewBoardShowcase } from './showcase'

// DEV-ONLY SHOWCASE (ADR-575) — the Business Seeder review board rendered WITHOUT auth against a
// hand-authored draft + ledger fixture, so the field-by-field confidence signals (✅/⚠️/🔴), the
// one-click provenance, the marked AI copy, and the flagged WITHHELD commercial facts can be
// eyeballed and QA'd without logging into the operator console (which is structure:write gated).
// The board's edit/confirm/drop/approve actions still hit the gated server actions (they no-op
// here without a session), but every visual state is exercisable. Route: /dev/business-seeder-review.
// NOINDEX + non-production gated, unlinked; a developer opens it directly.

export const metadata: Metadata = {
  title: 'Business Seeder review (dev)',
  robots: { index: false, follow: false },
}

export default function BusinessSeederReviewDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ReviewBoardShowcase />
}

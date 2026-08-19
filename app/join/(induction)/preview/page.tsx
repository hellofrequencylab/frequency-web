// Public, no-auth visual preview of the Funnels induction (ADR-068 → ADR-1090).
// No auth, no server writes;
// renders the full flow with sample data so the team can click through it.
// Exempted from the auth proxy in proxy.ts; noindexed below.

import type { Metadata } from 'next'
import FunnelInduction from '../induction'

export const metadata: Metadata = {
  title: 'Funnel induction (preview)',
  robots: { index: false, follow: false },
}

const DUMMY_REGIONS = [
  { id: 'preview-bay', name: 'San Francisco Bay Area' },
  { id: 'preview-la', name: 'Los Angeles' },
  { id: 'preview-nyc', name: 'New York City' },
  { id: 'preview-atx', name: 'Austin' },
]

export default function FunnelInductionPreviewPage() {
  return (
    <FunnelInduction
      preview
      userId="preview"
      userEmail="founder@example.com"
      initialHandle=""
      regions={DUMMY_REGIONS}
    />
  )
}

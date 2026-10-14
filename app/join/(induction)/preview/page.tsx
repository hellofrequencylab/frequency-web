// STAFF-ONLY visual preview of the Funnels induction (ADR-068 → ADR-1090; staff gate, owner
// 2026-10-14). No server writes; renders the full flow with sample data so the team can click
// through it. It used to be public; now only platform staff (web_role admin or janitor, the same
// isStaff check the /admin floor reads) get past the gate, and everyone else, signed out included,
// is sent to the real induction at /join. The sample data below never renders for them.
// The proxy still lets the path through (proxy.ts, the /join carve-out); this page is the gate.
// Noindexed below and listed in no sitemap or llms file.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
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

export default async function FunnelInductionPreviewPage() {
  // Fail closed: a lookup that throws is treated as not staff.
  const profile = await getCallerProfile().catch(() => null)
  if (!isStaff(profile?.webRole)) redirect('/join')

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

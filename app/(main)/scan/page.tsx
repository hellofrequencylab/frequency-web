// The in-app QR scanner (ADR-235): one camera surface that resolves ANY
// Frequency code — event check-in codes (/q → RSVP + checkInEvent), Ghost Node
// and partner plaques (/n → claim), member connect codes (/people). The
// scanner only navigates; the destinations own every flow and payout.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { Scanner } from '@/components/scan/scanner'

export const metadata: Metadata = {
  title: 'Scan',
  description: 'Scan any Frequency code: check in, capture a node, meet a member.',
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ hint?: string }>
}) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const { hint } = await searchParams
  return <Scanner hint={hint} />
}

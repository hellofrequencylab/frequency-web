import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { HuntStaffScanScreen } from '@/components/hunts/staff-proof-screens'
import { StaffScanForm } from '@/components/hunts/staff-scan-form'
import { huntSwitchOn } from '@/lib/hunts/flags'

export const dynamic = 'force-dynamic'

// THE VENUE STAFF DOOR (FH-020T): where a venue's staff check the one-time code a player shows. Dark until
// HUNTS_CLAIMS_ENABLED (and HUNTS_ENABLED) is on, then it 404s like a page that does not exist. Who may
// check what is decided on the server for each code (POST /api/hunts/staff/verify), never by being on this
// page: a signed-in member who is not staff there learns nothing about a code.
export const metadata: Metadata = { title: 'Check a player’s proof', robots: { index: false } }

export default async function HuntStaffPage() {
  if (!huntSwitchOn('claims')) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/hunts/staff')

  return (
    <>
      <HuntStaffScanScreen venueName="your venue" controls={<StaffScanForm />} />
      <p className="mx-auto mt-4 max-w-xl px-4 text-center text-body-sm text-muted">
        <Link href="/hunts/staff/review" className="underline">Review held claims</Link>
      </p>
    </>
  )
}

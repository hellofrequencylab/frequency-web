import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { loadCommerceAdmin } from '@/lib/hunts/commerce-admin'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { HuntCommerceAdmin } from '@/components/hunts/commerce-admin'

// HUNT COMMERCE (FH-036S, FH-038S): bind a published Hunt to a ticket for an Experience Pass, and approve the
// Space's store items for it. Dark until HUNTS_COMMERCE_ENABLED is on (404), then the Hunt gate decides who
// may manage it; a Hunt that is not the caller's answers 404 like one that is not there.
export const metadata: Metadata = { title: 'Hunt commerce', robots: { index: false } }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function HuntCommercePage({ params }: { params: Promise<{ id: string }> }) {
  if (!huntSwitchOn('commerce')) notFound()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/edit/${id}/commerce`)
  const view = await loadCommerceAdmin(id, profileId)
  if (!view) notFound()
  return <HuntCommerceAdmin view={view} />
}

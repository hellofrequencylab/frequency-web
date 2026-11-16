import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates/focus-template'
import { HuntStewardInvite } from '@/components/hunts/partner-screens'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { loadStewardInvite } from '@/lib/hunts/partner-store'

// THE VENUE'S ANSWER (FH-029). The link names a Hunt and a Space and carries no secret: the page shows
// an open invite only to the steward it names, and a partnership only to a current steward of the Space.
// Everyone else, including a person the link was forwarded to, gets the same 404 as a missing invite.
// Dark until HUNTS_AUTHORING_ENABLED is on.
export const metadata: Metadata = { title: 'Hunt partner invite', robots: { index: false } }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function HuntPartnerInvitePage({ params, searchParams }: {
  params: Promise<{ huntId: string; spaceId: string }>
  searchParams: Promise<{ said?: string | string[] }>
}) {
  if (!huntSwitchOn('authoring')) notFound()
  const { huntId, spaceId } = await params
  if (!UUID.test(huntId) || !UUID.test(spaceId)) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/partners/${huntId}/${spaceId}`)
  const view = await loadStewardInvite(huntId, spaceId, profileId, new Date().toISOString())
  if (!view) notFound()
  const { said } = await searchParams
  return (
    <FocusTemplate eyebrow="Frequency Hunts" title={view.huntTitle} description={`A partner invite for ${view.spaceName}.`} adminBar={false}>
      <HuntStewardInvite view={view} said={typeof said === 'string' ? said : null} />
    </FocusTemplate>
  )
}

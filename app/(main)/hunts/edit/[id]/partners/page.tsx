import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { FocusTemplate } from '@/components/templates/focus-template'
import { HuntPartnerList } from '@/components/hunts/partner-screens'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { listPartners } from '@/lib/hunts/partner-store'

// THE ORGANISER'S PARTNER LIST (FH-029): invite a venue Space through a named steward, see who has
// answered, and end a partnership. Dark until HUNTS_AUTHORING_ENABLED is on (404), then the Hunt gate
// decides; a Hunt that is not the caller's to run answers 404 like one that is not there.
export const metadata: Metadata = { title: 'Hunt partners', robots: { index: false } }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function HuntPartnersPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ said?: string | string[] }>
}) {
  if (!huntSwitchOn('authoring')) notFound()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/hunts/edit/${id}/partners`)
  const view = await listPartners(id, profileId, new Date().toISOString())
  if (!view) notFound()
  const { said } = await searchParams
  return (
    <FocusTemplate eyebrow="Frequency Hunts" title="Partner venues" description="Invite a Space to host a stop. The invite goes to one named steward of that Space, and only they can accept." back={{ href: `/hunts/edit/${id}`, label: 'Hunt' }} width="wide" adminBar={false}>
      <HuntPartnerList huntId={id} view={view} said={typeof said === 'string' ? said : null} />
    </FocusTemplate>
  )
}

import { notFound } from 'next/navigation'
import { ConsoleFocusTemplate } from '@/components/templates/console-templates'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { crossListingManagement, collectiveListingSpace, belongsToLiveCollective } from '@/lib/collective/cross-listing-store'
import { incomingPartnerInvites, type IncomingPartnerInvite } from '@/lib/collective/partners-store'
import { CrossListingEditor } from './editor'
import { PartnerInvites } from './partner-invites'
export const metadata={title:'Collective listings'}
export default async function CrossListingPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params
  const caller=await getCallerProfile()
  const space=await getSpaceBySlug(slug)
  if(!caller || !space || space.ownerProfileId!==caller.id || !spaceFunctionAccess(space,'profile','admin')) notFound()
  const source=await collectiveListingSpace(space.id)
  const canRequest=!!source && source.visibility!=='private' && await belongsToLiveCollective(source)
  // Partner invites (SCAN-982) land here: this is where a partner lists with the Collective it joins.
  const [management,invites]=await Promise.all([crossListingManagement(space.id),incomingPartnerInvites(space.id).catch((error:unknown):IncomingPartnerInvite[]=>{console.error('[collective-partners] invite read failed',error);return []})])
  return <ConsoleFocusTemplate title="Collective listings" description="List a Journey or Circle with another Space. Its owner approves before it appears."><div className="space-y-10"><PartnerInvites invites={invites}/><CrossListingEditor spaceId={space.id} canRequest={canRequest} {...management}/></div></ConsoleFocusTemplate>
}

import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { crossListingManagement, collectiveListingSpace, belongsToLiveCollective } from '@/lib/collective/cross-listing-store'
import { CrossListingEditor } from './editor'
export const metadata={title:'Collective listings'}
export default async function CrossListingPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params
  const caller=await getCallerProfile()
  const space=await getSpaceBySlug(slug)
  if(!caller || !space || space.ownerProfileId!==caller.id || !spaceFunctionAccess(space,'profile','admin')) notFound()
  const source=await collectiveListingSpace(space.id)
  const canRequest=!!source && source.visibility!=='private' && await belongsToLiveCollective(source)
  const management=await crossListingManagement(space.id)
  return <FocusTemplate title="Collective listings" description="List a Journey or Circle with another Space. Its owner approves before it appears."><CrossListingEditor spaceId={space.id} canRequest={canRequest} {...management}/></FocusTemplate>
}

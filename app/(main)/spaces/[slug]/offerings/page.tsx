import { ProfileTabBody } from '@/components/spaces/profile-tab-body'

// Entity profile — the Offerings tab (ENTITY-SPACES-BUILD §B.1/§B.3). The Space's upcoming sessions
// and events, via the blueprint's Offerings module set.
export default async function SpaceOfferingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProfileTabBody slug={slug} tabId="offerings" />
}

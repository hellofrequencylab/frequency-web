import { ProfileTabBody } from '@/components/spaces/profile-tab-body'

// Entity profile — the Community tab (ENTITY-SPACES-BUILD §B.1/§B.3). The Circles the Space runs,
// via the blueprint's Community module set.
export default async function SpaceCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProfileTabBody slug={slug} tabId="community" />
}

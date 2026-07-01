import { ProfileTabBody } from '@/components/spaces/profile-tab-body'

// Entity profile — the Practices & Journeys tab (ENTITY-SPACES-BUILD §B.1/§B.3). The Practices and
// Journeys the Space shares, via the blueprint's Practices module set.
export default async function SpacePracticesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProfileTabBody slug={slug} tabId="practices" />
}

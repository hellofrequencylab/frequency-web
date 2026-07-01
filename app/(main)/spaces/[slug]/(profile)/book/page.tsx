import { ProfileTabBody } from '@/components/spaces/profile-tab-body'

// Entity profile — the Book tab (ENTITY-SPACES-BUILD §B.1/§B.3). The Practitioner action tab: the
// primary CTA + bookable sessions, via the blueprint's Book module set (entity-cta).
export default async function SpaceBookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProfileTabBody slug={slug} tabId="book" />
}

import { ProfileTabBody } from '@/components/spaces/profile-tab-body'

// The entity profile's INDEX tab = About (ENTITY-SPACES-BUILD §B.1). Renders the blueprint's About
// module set via space-scoped <PageModules>. The Detail band + tabs are the layout; this is the
// body (children). Each module streams behind its own <Suspense> (PageModules), so the band never
// blocks on a slow section (D5).
export default async function SpaceAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ProfileTabBody slug={slug} tabId="about" />
}

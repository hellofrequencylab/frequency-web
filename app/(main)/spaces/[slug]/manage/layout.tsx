import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencySpaceConsole } from '@/components/frequency/admin/space-console'

// The Space console's chrome switch (ADR-1737). Under Frequency every /manage page sits in the design's
// admin shell (components/frequency/admin/space-console.tsx). SITE_DESIGN is build-time: a DAWN build
// renders the children untouched, with no read, exactly as before this layout existed.
export default async function SpaceManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (SITE_DESIGN !== 'frequency') return children
  const { slug } = await params
  return <FrequencySpaceConsole slug={slug}>{children}</FrequencySpaceConsole>
}

import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencySpaceConsole } from '@/components/frequency/admin/space-console'

// The Space CRM's chrome switch (ADR-1737). Under Frequency every /crm page sits in the design's Space
// console shell (components/frequency/admin/space-console.tsx), under its Resonance tab. SITE_DESIGN is
// build-time: a DAWN build renders the children untouched, with no read, exactly as before.
export default async function SpaceCrmLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (SITE_DESIGN !== 'frequency') return children
  const { slug } = await params
  return <FrequencySpaceConsole slug={slug}>{children}</FrequencySpaceConsole>
}

import { FrequencySpaceConsole } from '@/components/frequency/admin/space-console'

// The Space console's chrome switch (ADR-1737). Under Frequency every /manage page sits in the design's
// admin shell (components/frequency/admin/space-console.tsx).
export default async function SpaceManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <FrequencySpaceConsole slug={slug}>{children}</FrequencySpaceConsole>
}

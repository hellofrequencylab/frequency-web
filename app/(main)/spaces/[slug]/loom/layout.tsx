import { FrequencySpaceConsole } from '@/components/frequency/admin/space-console'

// This page is a row of the Space console's menu (SPACE_MODULES deep-links here), so under Frequency it sits in
// the console shell with the rest of its tab instead of dropping the owner out of it (ADR-1737). 
export default async function SpaceConsoleRowLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <FrequencySpaceConsole slug={slug}>{children}</FrequencySpaceConsole>
}

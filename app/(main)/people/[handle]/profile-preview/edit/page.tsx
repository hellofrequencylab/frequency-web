import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

// REDIRECT (ADR-516 Phase C). The standalone member grid editor was retired: the profile PAGE BUILDER now
// lives INLINE in the rail on the member's own /people/<handle> (the `account.layout` module), previewing
// every change live via the shared ProfileLayoutContext. Any old link / bookmark to this path is sent to
// the profile, where the builder now lives. Kept as a thin redirect route (not a next.config rule) so the
// handle is carried through; NOINDEX so a crawler never holds the dead URL.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function LegacyProfileGridEditRedirect({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  redirect(`/people/${handle}`)
}

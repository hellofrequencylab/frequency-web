import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Radio } from 'lucide-react'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { defaultAccentForType } from '@/lib/spaces/profile-config'
import { AccentScope } from '@/components/spaces/accent-scope'

// THE EXTERNAL SPACE WEBSITE (ADR-508 U4-B) is ON HOLD. Rather than render the standalone micro-site, the
// public /sites/<slug> route shows a friendly COMING SOON page that points back to the Space's in-app
// profile (/spaces/<slug>), so a shared link never dead-ends. The full BlockRender of the Home doc (filtered
// for the 'website' surface, fail-closed on preferences.websitePublished) lives in git history and can be
// restored when the external website ships. Resolved with an ANONYMOUS viewer, so a Private Space 404s (the
// coming-soon page never confirms a private Space exists). noindex while the surface is on hold.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return { title: 'Site', robots: { index: false } }
  const brandName = space.brandName?.trim() || space.name
  return { title: `${brandName} website coming soon`, robots: { index: false } }
}

export default async function SpaceWebsiteComingSoon({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Anonymous resolve: a Private Space is walled off here, so this page never confirms one exists.
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) notFound()

  const brandName = space.brandName?.trim() || space.name
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))

  return (
    <AccentScope vars={accentVars}>
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-6 py-16 text-text">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
            <Radio className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-text">Coming soon</h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            The standalone website for {brandName} is on its way. For now, everything lives on the
            {' '}
            {brandName} page on Frequency.
          </p>
          <Link
            href={`/spaces/${space.slug}`}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
          >
            Visit {brandName} on Frequency
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </main>
    </AccentScope>
  )
}

import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { spaceManageHref } from '@/lib/spaces/types'
import { SpaceBreadcrumbs } from '@/components/spaces/space-breadcrumbs'
import { SITE_NAME } from '@/lib/site'

// ── THE SPACE ROOT LAYOUT (thin, chrome-free) ───────────────────────────────────────────────────
// This layout wraps EVERY route under /spaces/<slug> — the public profile tabs AND the owner surfaces
// (manage / settings / crm / edit-page). Its ONLY job is the shared, path-independent work: resolve the
// Space (failing closed on a missing / not-visible Space, no existence leak) and stamp it into the
// request-scoped active-space context so every nested entity module reads THIS tenant's rows. It then
// renders children verbatim.
//
// WHY NO CHROME HERE (the soft-nav header bug fix): the profile cover + info band + tabs used to live in
// this shared layout, which decided whether to render them by reading the request path from the
// `x-pathname` header. That is invalid in the App Router — a layout does not re-render when you navigate
// between its child segments, and its output is cached per instance, so a prefetch of an owner sub-route
// rendered (and cached) the chrome-less branch, which then leaked onto the bare profile until a hard
// refresh. The chrome now lives in the `(profile)` route-group layout, which wraps ONLY the public
// profile routes; owner surfaces are siblings outside that group and get this thin shell alone. There is
// no path-branching left in this layout, so nothing can go stale across navigation.

const spaceVisibility = cache(getSpaceVisibility)

// The lowercase, article-prefixed role phrase for the meta description ("a practitioner", "an event
// space"). Sentence case, no em/en dashes (CONTENT-VOICE §5e).
function typePhrase(type: string): string {
  const noun = spaceTypeLabel(type).toLowerCase()
  const article = /^[aeiou]/.test(noun) ? 'an' : 'a'
  return `${article} ${noun}`
}

// ── PROFILE METADATA + INDEXABILITY (SEO/AIO flagship) ──────────────────────────────────────────
// generateMetadata resolves the Space ANONYMOUSLY (getSpaceBySlug, no viewer) so a crawler gets the
// right title/description/canonical without an auth round-trip. A NETWORK (public) Space is fully
// indexable; a PRIVATE Space emits noindex,nofollow so it can never leak into a search index. A missing
// Space gets a plain "not found" title (no existence signal beyond the 404 the page returns).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const space = await getSpaceBySlug(slug)
  if (!space || space.status !== 'active') return { title: 'Space not found' }

  const visibility = await spaceVisibility(slug)
  const isPrivate = visibility === 'private'

  const brandName = space.brandName?.trim() || space.name
  const tagline = await readTagline(space.id)

  // "{name}: a {type} on Frequency. {tagline}", trimmed under ~155 chars for the search snippet.
  const base = `${brandName}: ${typePhrase(space.type)} on ${SITE_NAME}.`
  const full = tagline ? `${base} ${tagline}` : base
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}...` : full
  const ogTitle = `${brandName} · ${SITE_NAME}`
  const canonical = `/spaces/${space.slug}`

  // PRIVATE: never index or follow (no leak). NETWORK: full canonical + OG (profile) + Twitter.
  if (isPrivate) {
    return {
      title: brandName,
      description,
      robots: { index: false, follow: false },
    }
  }

  return {
    title: brandName,
    description,
    alternates: { canonical },
    openGraph: { title: ogTitle, description, url: canonical, type: 'profile' },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function SpaceRootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()

  // Resolve the Space, failing closed on a missing OR not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Stamp the active Space so every entity module (a parameterless RSC) — and the (profile) chrome
  // layout — reads this tenant's rows without prop-drilling.
  setActiveSpace(space)

  // ONE brand-aware breadcrumb for the whole Space area (profile + owner surfaces). It reads the live
  // pathname client-side (soft-nav safe) and is the single wayfinding trail — the global auto-breadcrumb
  // is suppressed on /spaces/<slug> in the shell, and the owner pages drop their ad-hoc back links.
  const brandName = space.brandName?.trim() || space.name
  return (
    <>
      <SpaceBreadcrumbs slug={slug} brandName={brandName} manageHref={spaceManageHref(space.type, slug)} />
      {children}
    </>
  )
}

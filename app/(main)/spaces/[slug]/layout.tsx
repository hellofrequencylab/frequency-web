import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { spaceManageHref } from '@/lib/spaces/types'
import { SpaceBreadcrumbs } from '@/components/spaces/space-breadcrumbs'

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

// ── PROFILE METADATA + INDEXABILITY (SEO/AIO flagship) ──────────────────────────────────────────
// The builder lives in lib/spaces/profile-metadata so the public SUB-TABS can declare their own
// (App Router metadata is inherited, so a silent sub-tab used to emit this route's canonical and
// title and self-declare as a duplicate — FINALIZE-PLAN §9.5). This is the ROOT: no tab argument.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug)
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

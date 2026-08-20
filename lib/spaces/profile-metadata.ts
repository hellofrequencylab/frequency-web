import { cache } from 'react'
import type { Metadata } from 'next'
import { getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { SITE_NAME } from '@/lib/site'

// ── SPACE PROFILE METADATA (one builder, every public tab) ──────────────────────────────────────
//
// A Space profile is a ROOT plus sub-tabs (Calendar, Reviews, Shop, Collaborators, Book,
// and the operator's custom pages), each its own route segment. Metadata in the App Router is
// INHERITED: a segment that declares none keeps its parent's, field for field. So while the root
// layout was the only declarer, every sub-tab emitted the root's `<link rel="canonical">` and the
// root's `<title>` — eight routes telling a crawler they were duplicates of a page they are not,
// which is a self-inflicted deindex of exactly the pages a local business wants ranked
// (FINALIZE-PLAN §9.5).
//
// This module is the ONE builder. The layout calls it with no tab (the root); each sub-tab calls it
// with its own segment and label, and gets its own canonical, its own title, and its own
// description. Nothing else about the contract moves: a PRIVATE Space is still noindex/nofollow
// (no leak), a missing Space still gets a bare "not found" title with no existence signal, and the
// OG url tracks the canonical rather than the root.
//
// COST: zero extra round trips. getSpaceBySlug and readTagline are React-cached at their source and
// the visibility read is cached here, so a sub-tab's generateMetadata reuses the same reads its
// parent layout already made in this request.

/** Request-cached visibility read, shared by the layout and every sub-tab. */
const spaceVisibility = cache(getSpaceVisibility)

/** The lowercase, article-prefixed role phrase for the meta description ("a practitioner", "an
 *  event space"). Sentence case, no em/en dashes (CONTENT-VOICE §5e). */
function typePhrase(type: string): string {
  const noun = spaceTypeLabel(type).toLowerCase()
  const article = /^[aeiou]/.test(noun) ? 'an' : 'a'
  return `${article} ${noun}`
}

/** Trim a description to the ~155 chars a search snippet shows. */
function snippet(text: string): string {
  return text.length > 155 ? `${text.slice(0, 152).trimEnd()}...` : text
}

/**
 * One public sub-tab of a Space profile.
 *
 * `segment` is appended to `/spaces/<slug>` to form the canonical, so it must be the real path
 * segment. `label` leads the title. `describe` writes the tab's own meta description from the
 * Space's brand name; omit it to fall back to the profile description.
 */
export interface SpaceProfileTabMeta {
  segment: string
  label: string
  describe?: (brandName: string) => string
  /** Set for a tab that must never be indexed (a staff-only preview). */
  noindex?: boolean
}

/**
 * Metadata for a Space profile route: the root when `tab` is omitted, otherwise that sub-tab.
 *
 * Resolves the Space ANONYMOUSLY (getSpaceBySlug, no viewer) so a crawler gets the right
 * title/description/canonical without an auth round-trip.
 */
export async function spaceProfileMetadata(
  slug: string,
  tab?: SpaceProfileTabMeta,
): Promise<Metadata> {
  const space = await getSpaceBySlug(slug)
  if (!space || space.status !== 'active') return { title: 'Space not found' }

  const visibility = await spaceVisibility(slug)
  const isPrivate = visibility === 'private'

  const brandName = space.brandName?.trim() || space.name
  const tagline = await readTagline(space.id)

  // "{name}: a {type} on Frequency. {tagline}" for the profile itself; a sub-tab describes the tab.
  const base = `${brandName}: ${typePhrase(space.type)} on ${SITE_NAME}.`
  const profileDescription = snippet(tagline ? `${base} ${tagline}` : base)
  const description = tab?.describe ? snippet(tab.describe(brandName)) : profileDescription

  const title = tab ? `${tab.label} · ${brandName}` : brandName
  const ogTitle = tab ? `${tab.label} · ${brandName} · ${SITE_NAME}` : `${brandName} · ${SITE_NAME}`
  const canonical = tab ? `/spaces/${space.slug}/${tab.segment}` : `/spaces/${space.slug}`

  const openGraph = { title: ogTitle, description, url: canonical, type: 'profile' as const }

  // PRIVATE: never index or follow, and no OG card (unchanged contract, no leak). The canonical
  // now rides along because it names the URL the crawler already asked for, and because leaving it
  // off is what let a sub-tab inherit the ROOT's.
  if (isPrivate) {
    return { title, description, alternates: { canonical }, robots: { index: false, follow: false } }
  }

  // A public Space's staff-only tab: noindex, but still its own canonical and OG url, so it cannot
  // inherit the profile's and claim to BE the profile.
  if (tab?.noindex) {
    return {
      title,
      description,
      alternates: { canonical },
      robots: { index: false, follow: false },
      openGraph,
    }
  }

  return {
    title,
    description,
    alternates: { canonical },
    openGraph,
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

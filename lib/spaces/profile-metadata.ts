import { cache } from 'react'
import type { Metadata } from 'next'
import { getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { HOME_SLUG } from '@/lib/spaces/profile-pages'
import { profileCanonicalSite, resolveProfileSiteCanonical } from '@/lib/sites/profile-canonical'

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
interface SpaceProfileTabMeta {
  segment: string
  label: string
  describe?: (brandName: string) => string
  /** Set for a tab that must never be indexed (a staff-only preview). */
  noindex?: boolean
  /** Set by a tab that read its own content and found nothing to show a visitor (SCAN-1271). The
   *  page still renders its honest empty state; it just stops asking to be indexed. */
  empty?: boolean
}

// ── EMPTY TABS ARE NOT INDEXED (SCAN-1271) ──────────────────────────────────────────────────────
//
// The sitemap advertises a Space tab only when the Space actually has it (LIVE-184,
// listNetworkedSpaceProfileTabs), but the tab pages themselves render an honest empty state rather
// than a 404 and said `index, follow` either way. Measured on production 2026-11-19: 256 of 2,030
// indexable pages were Space tabs the sitemap had declined to list, most of them a heading, the
// shared chrome and "nothing here yet". That is thin content at scale under the Space's own name.
//
// So a tab the sitemap would not advertise says `noindex, follow`: one rule, read from the same
// reader, and the two cannot disagree. The tab comes back by itself the day it has content.
// Only the segments that reader gates per Space are judged; anything else keeps its own answer.
const SITEMAP_GATED_SEGMENTS: ReadonlySet<string> = new Set([
  'book', 'calendar', 'community', 'circles', 'collaborators', 'reviews', 'memberships', 'contact',
])

/** Whether the sitemap would advertise this tab: true or false when it could tell, null when it
 *  could not (the read failed, or returned nothing at all), and null keeps the tab indexable. */
async function tabIsAdvertised(slug: string, segment: string): Promise<boolean | null> {
  try {
    // Imported here, not at the top: the reader pulls the whole discovery module, which only this
    // branch needs, and a failed import must cost the rule and nothing else.
    const { listNetworkedSpaceProfileTabs } = await import('@/lib/spaces/discovery')
    const tabs = await listNetworkedSpaceProfileTabs()
    if (tabs.length === 0) return null
    return tabs.some((t) => t.slug === slug && t.segment === segment)
  } catch {
    return null
  }
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

  // "{name}: a {type} in {city} on Frequency. {tagline}" for the profile itself; a sub-tab
  // describes the tab. The locality is what makes a Space page answer "<type> in <city>" at all
  // (SCAN-665): without it the title and description read like any brand page, not a local listing.
  const city = space.city?.trim() || null
  const where = city ? ` in ${city}` : ''
  const base = `${brandName}: ${typePhrase(space.type)}${where} on ${SITE_NAME}.`
  const profileDescription = snippet(tagline ? `${base} ${tagline}` : base)
  const description = tab?.describe ? snippet(tab.describe(brandName)) : profileDescription

  // The root title names the place: "Yoga Loft, a studio in Encinitas". Sub-tabs keep the short
  // form, because the tab label already fills the title.
  const rootTitle = city ? `${brandName}, ${typePhrase(space.type)}${where}` : brandName
  const title = tab ? `${tab.label} · ${brandName}` : rootTitle
  const ogTitle = tab ? `${tab.label} · ${brandName} · ${SITE_NAME}` : `${rootTitle} · ${SITE_NAME}`
  const ownCanonical = tab ? `/spaces/${space.slug}/${tab.segment}` : `/spaces/${space.slug}`
  // THE SITE TWIN (PROG-E10 phase 4, LIVE-783). When the Space has published its website on its own
  // domain, the profile root and each of its pages are the same content as that site, so their
  // canonical points at the site and the domain is the one copy a search engine ranks. Tabs with no
  // site twin (calendar, reviews, shop...) keep their own. Private Spaces have no site at all.
  const siteCanonical = isPrivate ? null : await resolveProfileSiteCanonical(profileCanonicalSite(space), tab?.segment ?? HOME_SLUG)
  const canonical = siteCanonical ?? ownCanonical
  // With a site twin the share card IS the site's: it names the brand, not Frequency, and the root's
  // description is the tagline on its own, so "on Frequency." no longer eats the snippet's length.
  const twinDescription = siteCanonical && !tab?.describe && tagline ? snippet(tagline) : null
  const pageDescription = twinDescription ?? description

  // A tab has no share card of its own: the per-Space card is a file under the profile ROOT's
  // segment, and declaring `openGraph` here drops the site card the root layout would have lent
  // (SCAN-798). Measured 2026-11-19: 331 tab pages shipped no og:image at all. The root keeps
  // `images` unset so its own card still attaches (LIVE-141).
  const tabImages = tab ? { images: ROOT_OG_IMAGES } : {}
  const openGraph = siteCanonical
    ? { ...OG_SITE, siteName: brandName, title, description: pageDescription, url: canonical, type: 'profile' as const, ...tabImages }
    : { ...OG_SITE, title: ogTitle, description, url: canonical, type: 'profile' as const, ...tabImages }

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

  // SCAN-1271: an empty tab keeps its canonical and its card, and asks not to be indexed. `follow`
  // stays on so a crawler still walks through it to the rest of the Space. The networked, active,
  // non-root guard is the reader's own boundary: a Space outside it is not in the list for a
  // different reason, and is left alone.
  const judged =
    !!tab && !siteCanonical && space.type !== 'root' && space.networkConnected && SITEMAP_GATED_SEGMENTS.has(tab.segment)
  const thin = tab?.empty === true || (judged && (await tabIsAdvertised(space.slug, tab.segment)) === false)

  return {
    title,
    description: pageDescription,
    alternates: { canonical },
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    openGraph,
    twitter: { card: 'summary_large_image', title: openGraph.title, description: pageDescription, ...tabImages },
  }
}

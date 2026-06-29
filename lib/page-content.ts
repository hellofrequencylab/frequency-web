import { cache } from 'react'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPageSettings } from '@/lib/page-settings/store'

// Operator-editable page content, keyed by route (ADR-180/182). A coded page reads
// this and falls back to its hardcoded default when nothing is set, so editing is
// purely additive. Edited from the page's Settings panel by an operator (admin+);
// see components/admin/modules/page-content-module.
//
// Fields:
//   • title + description — the page header (and, via pageContentMetadata, the
//     page's <title>, meta description, and og/twitter cards).
//   • heroImage / ctaLabel / ctaHref — optional hero banner + call-to-action
//     (migration 20260612050000). NULL/blank = the page's coded default (usually:
//     nothing). The CTA renders only when BOTH label and href are set.
//
// `page_content` isn't in the generated DB types yet → untyped-client cast (repo
// convention). Cached per request so the header, metadata, and hero/CTA all share
// one read.

export interface PageContent {
  title: string
  description: string
  /** Optional hero image URL (root-relative or http(s)). Null = no hero. */
  heroImage?: string | null
  /** Optional call-to-action — renders only when BOTH label and href are set. */
  ctaLabel?: string | null
  ctaHref?: string | null
}

type PageContentRow = {
  title?: string | null
  description?: string | null
  hero_image?: string | null
  cta_label?: string | null
  cta_href?: string | null
}

export const getPageContent = cache(async (route: string): Promise<PageContent | null> => {
  try {
    const db = createAdminClient()
    // `select('*')` rather than a column list so the read keeps working before the
    // hero/CTA migration (20260612050000) is applied — not-yet-existing columns
    // simply come back undefined instead of erroring the whole row away.
    const { data } = await db
      .from('page_content')
      .select('*')
      .eq('route', route)
      .maybeSingle()
    if (!data) return null
    const row = data as PageContentRow
    return {
      title: row.title ?? '',
      description: row.description ?? '',
      heroImage: row.hero_image ?? null,
      ctaLabel: row.cta_label ?? null,
      ctaHref: row.cta_href ?? null,
    }
  } catch {
    return null
  }
})

/** Resolve a page's editable content, preferring the operator override. */
export async function resolvePageContent(
  route: string,
  fallback: PageContent,
): Promise<PageContent> {
  const c = await getPageContent(route)
  return {
    title: c?.title?.trim() || fallback.title,
    description: c?.description?.trim() || fallback.description,
    heroImage: c?.heroImage?.trim() || fallback.heroImage || null,
    ctaLabel: c?.ctaLabel?.trim() || fallback.ctaLabel || null,
    ctaHref: c?.ctaHref?.trim() || fallback.ctaHref || null,
  }
}

/**
 * SEO metadata from the same operator-set content that drives the page header
 * (PX.2): `<title>`, meta description, and og/twitter cards, with the coded
 * strings as the fallback. Use from a route's `generateMetadata`:
 *
 *   export function generateMetadata() {
 *     return pageContentMetadata('/events', CONTENT_FALLBACK)
 *   }
 *
 * The root layout's `metadataBase` + `title.template` ("%s · Frequency") still
 * apply, and `getPageContent` is request-cached, so metadata + the page body
 * share one DB read.
 */
export async function pageContentMetadata(
  route: string,
  fallback: Pick<PageContent, 'title' | 'description'>,
): Promise<Metadata> {
  const { title, description, heroImage } = await resolvePageContent(route, {
    title: fallback.title,
    description: fallback.description,
  })
  // Link previews: prefer the dedicated social image, then the page header image, then the
  // page-content hero (the banner the page actually shows). Without an image here, Next REPLACES
  // (not deep-merges) the layout's openGraph, dropping the operator's share card — so we resolve
  // and re-emit it. loadPageSettings is request-cached, shared with the layout's own read.
  const settings = await loadPageSettings(route)
  const ogImage = settings?.og_image_url ?? settings?.header_image_url ?? heroImage ?? null
  return {
    title,
    description,
    openGraph: { title, description, ...(ogImage ? { images: [{ url: ogImage }] } : {}) },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

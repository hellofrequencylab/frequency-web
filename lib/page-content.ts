import { cache } from 'react'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPageSettings } from '@/lib/page-settings/store'
import { resolveContentCascade } from '@/lib/layout/content-cascade'

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
// Cached per request so the header, metadata, and hero/CTA all share one read.
//
// ── THE READ IS A CASCADE NOW (PROG-P6, ADR-1122) ────────────────────────────
// `resolvePageContent` resolves site -> section -> page -> coded fallback via
// lib/layout/content-cascade.ts, so a route beneath a section inherits that
// section's hero and CTA instead of resolving to nothing. `getPageContent` below
// is UNCHANGED and still exact-route: it is what the operator editor reads, and an
// editor must show what THIS route stores, never what it borrows.
//
// 🔴 THIS FILE USED TO CAST THE ROW TO A HAND-WRITTEN SHAPE, and that is how the
// `hero_image` bug in ADR-1020's amendment stayed invisible. The comment here said
// "`page_content` isn't in the generated DB types yet → untyped-client cast (repo
// convention)". It IS in them (`lib/database.types.ts`, all seven columns), and
// `createAdminClient()` is `createServerClient<Database>` — so the reader was
// DOWNCASTING a correctly-typed row onto a local duplicate. The duplicate then
// became the only place a reader could see which columns exist, disconnected from
// the schema, which is exactly the wrong place to look when asking "is this row
// actually empty?". The generated type now flows through untouched.

export interface PageContent {
  title: string
  description: string
  /** Optional hero image URL (root-relative or http(s)). Null = no hero. */
  heroImage?: string | null
  /** Optional call-to-action — renders only when BOTH label and href are set. */
  ctaLabel?: string | null
  ctaHref?: string | null
}

export const getPageContent = cache(async (route: string): Promise<PageContent | null> => {
  try {
    const db = createAdminClient()
    // `select('*')` rather than a column list, and it stays that way now that the row is
    // typed: the generated `Row` is the enumeration of what exists, so a future column
    // lands here as a type error at the mapping below rather than as silence.
    const { data: row } = await db
      .from('page_content')
      .select('*')
      .eq('route', route)
      .maybeSingle()
    if (!row) return null
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

/** Resolve a page's editable content through the site → section → page CASCADE (PROG-P6,
 *  ADR-1122), with the page's coded copy as the last rung.
 *
 *  This used to be `getPageContent(route)` — one `.eq('route', route)` read — and the difference is
 *  only visible on a route BENEATH a section that has a row. `/events/calendar` now inherits
 *  `/events`'s hero; `/events` itself resolves exactly as it did. Identity fields (title,
 *  description) deliberately do NOT inherit: see lib/layout/content-cascade.ts for why, and for the
 *  CTA's pair rule. `getPageContent` keeps its exact-route meaning — the editor must show an
 *  operator what THIS route stores, not what it borrows. */
export async function resolvePageContent(
  route: string,
  fallback: PageContent,
): Promise<PageContent> {
  const c = await resolveContentCascade(route, fallback)
  return {
    title: c.title,
    description: c.description,
    heroImage: c.heroImage,
    ctaLabel: c.ctaLabel,
    ctaHref: c.ctaHref,
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
    // Self-canonical so faceted/filtered variants (e.g. /events?category=...&sort=...) consolidate
    // to the clean path instead of each query-string URL indexing as a duplicate. metadataBase
    // (root layout) resolves the relative path; harmless on the noindex in-app pages that also use
    // this helper.
    alternates: { canonical: route },
    openGraph: { title, description, ...(ogImage ? { images: [{ url: ogImage }] } : {}) },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

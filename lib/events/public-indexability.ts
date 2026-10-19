// AN UNLISTED EVENT IS A LINK, NOT A LISTING (ADR-202, SCAN-1014).
//
// `public_event_by_slug` admits public AND unlisted because the slug is the link. It does not
// return `visibility`, and generateMetadata on the public ISR share page (`/events/<slug>`)
// therefore always set a canonical and only noindexed past dates and extra series occurrences.
// SCAN-867/876 then made that page a full Event with a guest join box, so a crawler that saw the
// shared link could index an unlisted event. The member twin already noindexes anything that is
// not strictly public; this module is the share page's matching indexability rule.
//
// WHY A SERVER READ, NOT A WIDENED RPC. Adding an OUT column to `public_event_by_slug` is a
// DROP + CREATE of a SECURITY DEFINER function granted to anon (the blast radius `app/discover/
// events/_data.ts` already refused for `cover_url` and `time_zone`). Anon already has SELECT on
// `events.visibility` (20270330000000 kept it) and RLS already admits unlisted rows, but
// generateMetadata never called that read. The venue and join door on this page already use the
// service role without cookies, so ISR stays. The share CARD still renders for unlisted
// (`opengraph-image.tsx`): that is the distribution model, and it is not this question.

import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

/** Follow stays on: the page is the link someone was sent, and its own links may still be public. */
export const UNLISTED_EVENT_ROBOTS = { index: false, follow: true } as const

export function isUnlistedShare(visibility: string | null | undefined): boolean {
  return visibility === 'unlisted'
}

async function readPublicEventLinkVisibility(slug: string): Promise<'public' | 'unlisted' | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('events')
      .select('visibility')
      .eq('slug', slug)
      .in('visibility', ['public', 'unlisted'])
      .eq('status', 'published')
      .is('removed_at', null)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    const visibility = (data as { visibility: string } | null)?.visibility
    if (visibility === 'public' || visibility === 'unlisted') return visibility
    return null
  } catch {
    // Fail-soft: a missed read must not noindex every public event, and generateMetadata still
    // has the RPC row. An unlisted event whose visibility we could not read stays as it was.
    return null
  }
}

/** One read per request, shared between generateMetadata and the page body. */
export const getPublicEventLinkVisibility = cache(readPublicEventLinkVisibility)

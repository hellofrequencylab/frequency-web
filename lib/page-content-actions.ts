'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'
import { isLoomPublicImageUrl } from '@/lib/loom/urls'

// Who may edit page content (ADR-180) — role-specific: admin+ (operators who tune
// public-facing chrome). Reads return null for anyone below, so the editor renders
// nothing for them; writes re-check, so the server action is the authority.
const MIN_ROLE = 'admin' as const

// Field caps — the title/description are page chrome, not long-form content.
const MAX_TITLE = 200
const MAX_DESCRIPTION = 600
const MAX_CTA_LABEL = 80
const MAX_URL = 2048

/** Editable content shape handed to the editor (empty string = no override). */
export type EditablePageContent = {
  title: string
  description: string
  heroImage: string
  ctaLabel: string
  ctaHref: string
}

/** Hero/CTA links must be root-relative or http(s) — never raw schemes like
 *  `javascript:`, since they're rendered straight into `src`/`href`.
 *  Returns the cleaned link, null for blank (= clear), or 'invalid'. */
function cleanLink(raw: FormDataEntryValue | null): string | null | 'invalid' {
  const v = ((raw as string) ?? '').trim().slice(0, MAX_URL)
  if (!v) return null
  return /^(\/(?!\/)|https?:\/\/)/i.test(v) ? v : 'invalid'
}

/** Only the routes wired for content editing (the registry) are accepted — the
 *  route comes from the client (usePathname), so it's validated against the allowlist
 *  rather than trusted, even though the action is already admin-gated. */
function isEditableRoute(route: string): route is (typeof CONTENT_EDIT_ROUTES)[number] {
  return (CONTENT_EDIT_ROUTES as readonly string[]).includes(route)
}

/** Current editable content for a route, or null if the caller can't edit it. */
export async function getEditablePageContent(
  route: string,
): Promise<EditablePageContent | null> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, MIN_ROLE)) return null
  if (!isEditableRoute(route)) return null
  const db = createAdminClient()
  // `select('*')` so the read keeps working before the hero/CTA migration
  // (20260612050000) lands — missing columns just come back undefined.
  const { data } = await db
    .from('page_content')
    .select('*')
    .eq('route', route)
    .maybeSingle()
  const row = data as {
    title?: string | null
    description?: string | null
    hero_image?: string | null
    cta_label?: string | null
    cta_href?: string | null
  } | null
  return {
    title: row?.title ?? '',
    description: row?.description ?? '',
    heroImage: row?.hero_image ?? '',
    ctaLabel: row?.cta_label ?? '',
    ctaHref: row?.cta_href ?? '',
  }
}

/** Upsert a route's editable content (a blank field clears that override). */
export async function savePageContent(route: string, fd: FormData): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, MIN_ROLE)) return fail('Not allowed.')
  if (!isEditableRoute(route)) return fail('That page isn’t editable.')
  const title = ((fd.get('title') as string) ?? '').trim().slice(0, MAX_TITLE) || null
  const description = ((fd.get('description') as string) ?? '').trim().slice(0, MAX_DESCRIPTION) || null
  const cta_href = cleanLink(fd.get('cta_href'))
  if (cta_href === 'invalid') {
    return fail('Links must start with “/” or “http(s)://”.')
  }
  const cta_label = ((fd.get('cta_label') as string) ?? '').trim().slice(0, MAX_CTA_LABEL) || null
  // NOTE: hero_image is intentionally omitted. The hero is managed on its own by
  // setPageHeroUrl/removePageHero (the InlineCover) and there is no hero_image field in
  // this form — including it here would read null and WIPE a just-set hero. Omitting
  // it from the upsert preserves the existing value on conflict (PostgREST only SETs the
  // columns present in the payload).
  const db = createAdminClient()
  const { error } = await db
    .from('page_content')
    .upsert({
      route, title, description, cta_label, cta_href,
      updated_by: me.id, updated_at: new Date().toISOString(),
    })
  if (error) return fail(error.message)
  revalidatePath(route)
  return ok()
}

/** Persist a Loom-picked hero URL for a route (the file is already stored in the Loom, so this just
 *  validates + writes the column). Same admin gate + route guard as savePageContent; the URL must be
 *  a Supabase public object URL so a caller can't inject an arbitrary src. */
export async function setPageHeroUrl(route: string, url: string): Promise<{ error: string } | void> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, MIN_ROLE)) return { error: 'Not allowed.' }
  if (!isEditableRoute(route)) return { error: 'That page isn’t editable.' }
  if (!isLoomPublicImageUrl(url)) return { error: 'That image could not be used.' }
  const db = createAdminClient()
  const { error } = await db.from('page_content').upsert({
    route,
    hero_image: url,
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath(route)
}

/** Clear a route's hero image. Admin-gated; mirrors removeCircleCover. */
export async function removePageHero(route: string): Promise<void> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, MIN_ROLE)) throw new Error('Not allowed.')
  if (!isEditableRoute(route)) throw new Error('That page isn’t editable.')

  const db = createAdminClient()
  const { error } = await db
    .from('page_content')
    .upsert({
      route,
      hero_image: null,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    })
  if (error) throw new Error(error.message)

  revalidatePath(route)
}

'use server'

// Admin write-path for managed dynamic codes (`qr_codes`) — the retargetable
// /q/<slug> short links. Service-role writes (RLS denies client access), gated to
// host+. Slugs are auto-generated unless a custom one is given; uniqueness is
// enforced by the unique index (we retry generated collisions, surface custom ones).

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import {
  generateSlug,
  normalizeSlug,
  isValidSlug,
  isValidTargetUrl,
  type DestinationType,
} from '@/lib/qr/codes'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import type { Json } from '@/lib/database.types'

export interface LinkInput {
  title: string
  destination_type: DestinationType
  /** Required when destination_type==='url'; may point anywhere. */
  target_url: string | null
  /** Required when destination_type==='node'. */
  node_id: string | null
  /** Required when destination_type==='circle'. */
  circle_id: string | null
  /** Required when destination_type==='event'. */
  event_id: string | null
  /** Time-aware (url only): after switch_at, resolve to alt_target_url. */
  switch_at: string | null
  alt_target_url: string | null
  /** Custom slug, or null/'' to auto-generate (create) / keep (update). */
  slug: string | null
  partner_id: string | null
  valid_until: string | null
  /** Campaign/source label stamped into first-touch on scan (UTM passthrough). */
  source_tag: string | null
  /** Visual design; sanitized by parseStyle before persisting. */
  style: QrStyle
}

interface CleanLink {
  title: string
  destination_type: DestinationType
  target_url: string | null
  node_id: string | null
  circle_id: string | null
  event_id: string | null
  switch_at: string | null
  alt_target_url: string | null
  partner_id: string | null
  valid_until: string | null
  source_tag: string | null
  style: Json
}

const DESTS: DestinationType[] = ['url', 'node', 'circle', 'event']

function clean(input: LinkInput): CleanLink | string {
  const title = input.title.trim()
  if (!title) return 'Give the code a title.'
  if (!DESTS.includes(input.destination_type)) return 'Pick a destination type.'

  let target_url: string | null = null
  let node_id: string | null = null
  let circle_id: string | null = null
  let event_id: string | null = null
  let switch_at: string | null = null
  let alt_target_url: string | null = null

  if (input.destination_type === 'url') {
    const u = (input.target_url ?? '').trim()
    if (!u) return 'Enter the destination URL.'
    if (!isValidTargetUrl(u)) return 'That doesn’t look like a valid URL.'
    target_url = u
    // Optional time-aware switch — both fields or neither.
    const alt = (input.alt_target_url ?? '').trim()
    if (input.switch_at && alt) {
      if (!isValidTargetUrl(alt)) return 'The “switch to” URL doesn’t look valid.'
      switch_at = input.switch_at
      alt_target_url = alt
    }
  } else if (input.destination_type === 'node') {
    if (!input.node_id) return 'Choose the check-in code to point at.'
    node_id = input.node_id
  } else if (input.destination_type === 'circle') {
    if (!input.circle_id) return 'Choose the circle to join on scan.'
    circle_id = input.circle_id
  } else {
    if (!input.event_id) return 'Choose the event to check in to.'
    event_id = input.event_id
  }

  return {
    title,
    destination_type: input.destination_type,
    target_url,
    node_id,
    circle_id,
    event_id,
    switch_at,
    alt_target_url,
    partner_id: input.partner_id || null,
    valid_until: input.valid_until || null,
    source_tag: input.source_tag?.trim() ? input.source_tag.trim().slice(0, 60) : null,
    style: parseStyle(input.style) as unknown as Json,
  }
}

const UNIQUE_VIOLATION = '23505'

export async function createLink(input: LinkInput): Promise<ActionResult<{ id: string; slug: string }>> {
  const { profileId } = await requireAdmin('host')
  const row = clean(input)
  if (typeof row === 'string') return fail(row)

  const db = createAdminClient()

  // Custom slug: validate + single attempt (collision = a clear message).
  const custom = input.slug ? normalizeSlug(input.slug) : ''
  if (input.slug && !isValidSlug(custom)) {
    return fail('Custom links use letters, numbers, and hyphens (3–48 chars).')
  }

  // Generated slug: retry a few collisions (astronomically unlikely, but cheap).
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = custom || generateSlug()
    const { data, error } = await db
      .from('qr_codes')
      .insert({ ...row, slug, created_by: profileId })
      .select('id, slug')
      .single()
    if (!error && data) {
      revalidatePath('/admin/qr')
      return ok({ id: data.id, slug: data.slug })
    }
    if (error?.code === UNIQUE_VIOLATION) {
      if (custom) return fail('That custom link is already taken.')
      continue // generated collision — try another
    }
    return fail('Could not create the code.')
  }
  return fail('Could not generate a unique link — try again.')
}

export async function updateLink(id: string, input: LinkInput): Promise<ActionResult> {
  await requireAdmin('host')
  const row = clean(input)
  if (typeof row === 'string') return fail(row)

  const db = createAdminClient()

  let slugPatch: { slug?: string } = {}
  if (input.slug) {
    const slug = normalizeSlug(input.slug)
    if (!isValidSlug(slug)) return fail('Custom links use letters, numbers, and hyphens (3–48 chars).')
    slugPatch = { slug }
  }

  const { error } = await db.from('qr_codes').update({ ...row, ...slugPatch }).eq('id', id)
  if (error?.code === UNIQUE_VIOLATION) return fail('That custom link is already taken.')
  if (error) return fail('Could not save changes.')

  revalidatePath('/admin/qr')
  return ok()
}

export async function setLinkActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin('host')
  const db = createAdminClient()
  const { error } = await db.from('qr_codes').update({ active }).eq('id', id)
  if (error) return fail('Could not update the code status.')
  revalidatePath('/admin/qr')
  return ok()
}

'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getPillars } from '@/lib/pillars'
import { isLoomPublicImageUrl } from '@/lib/loom/urls'
import { slugify } from '@/lib/utils'

// In-place "Channel settings" admin module (EMBEDDED-ADMIN.md / ADR-133, PX.5). Topical channels are
// PLATFORM-CURATED — there is no per-channel host, so both the read and every write gate on staff
// (admin+), mirroring channel.manage in capabilities.ts. The admin client bypasses RLS; the check
// here is the authority, re-run inside every exported action (ADR-274).
//
// ADR-879 completed the operator surface: cover image, Pillar, category (now a closed vocabulary,
// lib/channels/categories.ts), slug, display order, and visibility all edit here. Members, Circles,
// the Program, and the owner Space stay where they already live — the Channel Manage hub
// (/channels/[id]/manage, ADR-870/871) — and the module links out to them rather than rebuilding them.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function isChannelManager(): Promise<boolean> {
  const caller = await getCallerProfile()
  return !!caller && isStaff(caller.webRole)
}

/** Revalidate every path a channel edit can be seen on: its page under BOTH handles (a channel
 *  resolves by id or slug) and the directory. */
function revalidateChannel(id: string, ...slugs: (string | null | undefined)[]) {
  revalidatePath(`/channels/${id}`)
  for (const s of slugs) if (s) revalidatePath(`/channels/${s}`)
  revalidatePath('/channels')
}

/** Load the editable fields of a topical channel plus the Pillar options, but only for staff
 *  (admin+). Returns null otherwise — the module renders no chrome for non-operators. */
export async function getChannelAdminData(idOrSlug: string) {
  if (!(await isChannelManager())) return null

  const admin = createAdminClient()
  const matchField = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data: channel } = await admin
    .from('topical_channels')
    .select('id, name, slug, category, description, cover_image, display_order, is_active, pillar_id')
    .eq(matchField, idOrSlug)
    .maybeSingle()
  if (!channel) return null

  // The four active Pillars, in display order — the select's options.
  const pillars = (await getPillars()).map((p) => ({ id: p.id, name: p.name }))
  return { ...channel, pillars }
}

// ─── Insights (the 'insights' spine cell, ADR-515 Phase 5) ──────────────────────
// The channel at a glance: how many members are tuned in and how many circles are practicing it — the
// same two readouts the detail page shows. Staff (admin+) only; returns null otherwise, so the rail module
// renders no chrome for non-operators. Reuses the SAME tables the channel detail page counts.

export interface ChannelInsightsData {
  tunedIn: number
  circleCount: number
}

export async function getChannelInsightsData(idOrSlug: string): Promise<ChannelInsightsData | null> {
  if (!(await isChannelManager())) return null

  const admin = createAdminClient()
  const matchField = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data: channel } = await admin
    .from('topical_channels')
    .select('id')
    .eq(matchField, idOrSlug)
    .maybeSingle()
  if (!channel) return null

  const [{ count: tunedIn }, { count: circleCount }] = await Promise.all([
    admin
      .from('topical_channel_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('topical_channel_id', channel.id),
    admin
      .from('circles')
      .select('id', { count: 'exact', head: true })
      .eq('topical_channel_id', channel.id)
      .neq('status', 'archived'),
  ])

  return { tunedIn: tunedIn ?? 0, circleCount: circleCount ?? 0 }
}

// The admin client's generated types don't cover every column written below (pillar_id,
// display_order, cover_image, slug); cast to an untyped update surface for those, with the staff
// gate above as the real authority. Mirrors the same seam in circles/admin-actions.ts.
type UntypedUpdate = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

/**
 * Patch a topical channel's curated fields in place. Staff (admin+) only.
 *
 * ONLY the fields the operator actually submitted are written. The rail autosaves a snapshot of
 * whatever form is on screen, and the module is not the only caller, so a patch built from
 * `fd.has(...)` means a form that omits a field can never blank it. (Checkbox-shaped controls are
 * therefore selects with an explicit on/off value: an unchecked checkbox submits NOTHING, which
 * would read as "not submitted" and make the field one-way.)
 */
export async function updateChannelSettings(id: string, slug: string, fd: FormData) {
  if (!(await isChannelManager())) throw new Error('Unauthorized')

  const text = (k: string) => ((fd.get(k) as string) ?? '').trim()
  const patch: Record<string, unknown> = {}

  if (fd.has('name')) {
    const name = text('name')
    if (!name) throw new Error('Name is required')
    patch.name = name
  }
  if (fd.has('category')) patch.category = text('category') || 'general'
  if (fd.has('description')) patch.description = text('description') || null
  if (fd.has('pillar_id')) patch.pillar_id = text('pillar_id') || null
  if (fd.has('is_active')) patch.is_active = fd.get('is_active') === 'on'
  if (fd.has('display_order')) {
    const n = Number.parseInt(text('display_order'), 10)
    patch.display_order = Number.isFinite(n) ? n : 0
  }

  if (Object.keys(patch).length === 0) return

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('topical_channels')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidateChannel(id, slug)
}

/**
 * Rename a channel's slug, which is its URL. Slugifies the input, refuses an empty result, and
 * refuses a collision with a plain sentence rather than throwing (the operator sees it next to the
 * field). Returns the new slug so the client can move the page to it. BOTH the old and the new
 * paths are revalidated, so the abandoned URL stops serving a cached page.
 */
export async function updateChannelSlug(
  id: string,
  currentSlug: string,
  newSlug: string,
): Promise<{ slug: string } | { error: string }> {
  if (!(await isChannelManager())) return { error: 'Unauthorized' }

  const next = slugify(newSlug ?? '')
  if (!next) return { error: 'The URL cannot be empty.' }
  if (next === currentSlug) return { slug: next }

  const admin = createAdminClient()
  const { data: clash } = await admin
    .from('topical_channels')
    .select('id')
    .eq('slug', next)
    .neq('id', id)
    .maybeSingle()
  if (clash) return { error: 'Another Channel already uses that URL. Try a different one.' }

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('topical_channels')
    .update({ slug: next })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidateChannel(id, currentSlug, next)
  return { slug: next }
}

/** Set the channel's cover image from a Loom pick. The URL must be a Loom public image URL, so a
 *  caller cannot smuggle an arbitrary address into a rendered `src`. Staff (admin+) only. */
export async function setChannelCoverUrl(
  id: string,
  slug: string,
  url: string,
): Promise<{ error: string } | void> {
  if (!(await isChannelManager())) return { error: 'Unauthorized' }
  if (!isLoomPublicImageUrl(url)) return { error: 'That image could not be used.' }

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('topical_channels')
    .update({ cover_image: url })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidateChannel(id, slug)
}

/** Clear the channel's cover image. The page falls back to its token gradient. Staff (admin+) only. */
export async function removeChannelCover(id: string, slug: string) {
  if (!(await isChannelManager())) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('topical_channels')
    .update({ cover_image: null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidateChannel(id, slug)
}

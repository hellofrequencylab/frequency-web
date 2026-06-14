import 'server-only'
import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardZaps } from '@/lib/zaps'
import { getWalkthrough } from '@/lib/walkthroughs'
import { readProgressMap, type WalkthroughProgress } from '@/lib/walkthroughs/runtime'

// Walkthroughs Phase B — progress writers (server-only). Progress lives in
// profiles.meta.walkthroughs[slug] = { seenAt?, dismissedAt?, completedAt? }, mirroring
// how the tour stores its state in profiles.meta.tour — NO migration. Every writer is
// best-effort (read meta, merge the one slug, write back) and never throws: a failed
// timestamp must never break the feed. completeWalkthrough also pays the walkthrough's
// total step zaps exactly once (guarded on the prior completedAt being absent).

type Meta = Record<string, Json>

// A walkthrough slug is a GENERATED slug (lib/qr/codes generateSlug + the editor's
// slugify): lowercase alphanumerics + hyphens. Validate it against that allowlist
// before ever using it as a property KEY, so a crafted value can never inject into or
// pollute profiles.meta (remote property injection / prototype pollution, e.g.
// __proto__ / constructor / prototype). An unsafe slug is a no-op everywhere below.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/i
function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG.test(slug) && slug !== '__proto__' && slug !== 'constructor' && slug !== 'prototype'
}

/** Read profiles.meta for one member (best-effort). */
async function readMeta(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<Meta | null> {
  const { data, error } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  if (error || !data) return null
  return ((data.meta as Meta | null) ?? {}) as Meta
}

/** Merge a timestamp patch into meta.walkthroughs[slug] and write it back. */
async function patchProgress(profileId: string, slug: string, patch: WalkthroughProgress): Promise<void> {
  if (!isSafeSlug(slug)) return
  try {
    const admin = createAdminClient()
    const meta = await readMeta(admin, profileId)
    if (meta === null) return
    const map = readProgressMap(meta)
    const next = { ...map, [slug]: { ...(map[slug] ?? {}), ...patch } }
    await admin
      .from('profiles')
      .update({ meta: { ...meta, walkthroughs: next } as Json })
      .eq('id', profileId)
  } catch {
    // best-effort
  }
}

/** Stamp that the member has seen this walkthrough's card (advances the cadence clock). */
export async function markWalkthroughSeen(profileId: string, slug: string): Promise<void> {
  await patchProgress(profileId, slug, { seenAt: new Date().toISOString() })
}

/**
 * Mark a (role-promotion) tour PENDING for a member — called by assignRole when a role
 * is granted, so the tour fires on the actual promotion. Best-effort, and only stamps
 * when the tour isn't already finished (a re-grant of a role the member already toured
 * past never re-surfaces it). Same merge-one-slug write as every other progress writer.
 */
export async function markWalkthroughPending(profileId: string, slug: string): Promise<void> {
  if (!isSafeSlug(slug)) return
  try {
    const admin = createAdminClient()
    const meta = await readMeta(admin, profileId)
    if (meta === null) return
    const map = readProgressMap(meta)
    if (map[slug]?.completedAt || map[slug]?.dismissedAt) return // already toured / opted out
    if (map[slug]?.pendingAt) return // already pending — don't reset the clock
    const next = { ...map, [slug]: { ...(map[slug] ?? {}), pendingAt: new Date().toISOString() } }
    await admin
      .from('profiles')
      .update({ meta: { ...meta, walkthroughs: next } as Json })
      .eq('id', profileId)
  } catch {
    // best-effort
  }
}

/** Stamp a "Not now" dismissal (cadence then hides it for the dismiss window). */
export async function dismissWalkthrough(profileId: string, slug: string): Promise<void> {
  await patchProgress(profileId, slug, { dismissedAt: new Date().toISOString() })
}

/**
 * Stamp completion and, ONCE, award the sum of the walkthrough's step zaps. The
 * one-time guard reads the member's current progress: if completedAt is already set we
 * skip both the write and the award, so finishing twice never double-pays.
 */
export async function completeWalkthrough(profileId: string, slug: string): Promise<void> {
  if (!isSafeSlug(slug)) return
  try {
    const admin = createAdminClient()
    const meta = await readMeta(admin, profileId)
    if (meta === null) return
    const map = readProgressMap(meta)
    if (map[slug]?.completedAt) return // already completed — never re-pay

    const completedAt = new Date().toISOString()
    const next = { ...map, [slug]: { ...(map[slug] ?? {}), completedAt } }
    await admin
      .from('profiles')
      .update({ meta: { ...meta, walkthroughs: next } as Json })
      .eq('id', profileId)

    // Award the walkthrough's total step zaps, only when there's something to give.
    const wt = await getWalkthrough(slug)
    const amount = (wt?.steps ?? []).reduce((sum, s) => sum + (s.zaps && s.zaps > 0 ? s.zaps : 0), 0)
    if (amount > 0) {
      await awardZaps(profileId, amount, {
        actionType: 'walkthrough_complete',
        metadata: { slug },
      })
    }
  } catch {
    // best-effort
  }
}

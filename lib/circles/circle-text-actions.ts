'use server'

import { revalidatePath } from 'next/cache'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getJanitor } from '@/lib/page-editor/guard'
import { setPlatformSetting } from '@/lib/platform-flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { CIRCLE_TEXT_KEY, CIRCLE_TEXT_MAX, circleTextOverride, getCircleTextDefault } from './circle-text'

// The mutating + client-callable server ACTIONS for the movable circle TEXT block, split from
// circle-text.ts (the read helpers) so this 'use server' module exposes only async actions, as Next
// requires. Every write re-gates server-side: the editor's capability gate is convenience; this is
// the law. The per-circle override is gated by circle.editSettings (host + operators); the network
// default is janitor-only.

// circles.sidebar_order is the jsonb column freed by ADR-406 — not in the generated row types here,
// so writes go through this narrow untyped surface (ADR-246).
const UNTYPED = (admin: ReturnType<typeof createAdminClient>) =>
  admin as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
      }
    }
  }

/** The per-circle override text for the editor (circle.editSettings), or null if not permitted. */
export async function getCircleTextForEditor(
  slug: string,
): Promise<{ id: string; slug: string; text: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('circles').select('id, slug, sidebar_order').eq('slug', slug).maybeSingle()
  if (!data) return null
  const row = data as unknown as { id: string; slug: string; sidebar_order: unknown }
  const caps = await getCircleCapabilities(row.id)
  if (!caps.has('circle.editSettings')) return null
  return { id: row.id, slug: row.slug, text: circleTextOverride(row.sidebar_order) ?? '' }
}

/** Save a circle's per-circle text override (circle.editSettings). Empty clears it. */
export async function saveCircleTextOverride(id: string, slug: string, text: string): Promise<{ error?: string }> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }
  const value = text.trim() ? { text: text.slice(0, CIRCLE_TEXT_MAX) } : null
  const { error } = await UNTYPED(createAdminClient()).from('circles').update({ sidebar_order: value }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/circles/${slug}`)
  return {}
}

/** The network-wide default text for the operator editor (janitor only), or null otherwise. */
export async function getCircleTextDefaultForEditor(): Promise<{ text: string } | null> {
  const janitor = await getJanitor()
  if (!janitor) return null
  return { text: await getCircleTextDefault() }
}

/** Save the network-wide default circle text (janitor only). Revalidates nothing here — circle pages
 *  are force-dynamic, so the next render picks up the new default. */
export async function saveCircleTextDefault(text: string): Promise<{ error?: string }> {
  const janitor = await getJanitor()
  if (!janitor) return { error: 'Not allowed.' }
  try {
    await setPlatformSetting(CIRCLE_TEXT_KEY, text.slice(0, CIRCLE_TEXT_MAX), janitor.profileId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save the default text.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { saveSeriesDisplayConfig, type SeriesDisplayConfig } from '@/lib/events/series-config'
import { setPlatformFlag } from '@/lib/platform-flags'

// The write half of the repeating-events knobs (ADR-897 §7.4). Models
// app/(main)/admin/onboarding-controls/actions.ts:16-21.
//
// ⚠️ GATE: /admin/events itself admits community host AND community staff
// (requireAdmin('host', { staff: 'community' }) on the page), but these three numbers are
// PLATFORM-WIDE, so this action re-gates on janitor. The chrome decides what renders; the action is
// the law. Never rely on the section being hidden.
//
// ⚠️ revalidatePath('/', 'layout') is a full-site purge. It is correct here and only here: the knob
// genuinely reaches every browse surface in the product, and a statically rendered page would
// otherwise keep serving the old number until its next render. Signature verified against
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md
// (revalidatePath(path, type?), type is 'layout' | 'page'). Do not copy it onto a hotter path.

/** Save the three display numbers. Returns the STORED value, so an operator who types 99 sees 60
 *  come back and learns the range instead of believing the 99 landed. */
export async function saveSeriesDisplay(patch: Partial<SeriesDisplayConfig>): Promise<SeriesDisplayConfig> {
  const { profileId } = await requireAdmin('janitor')
  const stored = await saveSeriesDisplayConfig(patch, profileId)
  revalidatePath('/', 'layout')
  revalidatePath('/admin/events')
  return stored
}

// ── Chat consolidation switch (ADR-896) ─────────────────────────────────────────────────────────
//
// The flag existed with no operator control, so flipping it meant hand-writing SQL against
// platform_flags — which is not a control, it is a trapdoor. Same janitor gate and same audit trail
// as the numbers above (setPlatformFlag writes platform_flag_events: who, when, old -> new).
//
// ⚠️ Turning this ON retires the full-page DM view: /messages/<id> stops rendering the page and
// hands the conversation to the dock. Do not flip it until the dock carries rename, leave and the
// participant roster for group conversations, because those exist ONLY on the page today. The
// toggle's own copy says so; this comment is for whoever reads the action first.
export async function setChatDmRoutesRetired(retired: boolean): Promise<void> {
  const { profileId } = await requireAdmin('janitor')
  await setPlatformFlag('chat_dm_routes_retired', retired, { changedBy: profileId, source: 'admin' })
  // The gate is read per request on the DM route, so only that subtree needs purging.
  revalidatePath('/messages', 'layout')
  revalidatePath('/admin/events')
}

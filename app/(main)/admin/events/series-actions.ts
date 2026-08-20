'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { saveSeriesDisplayConfig, type SeriesDisplayConfig } from '@/lib/events/series-config'
import { setEventsListingHorizonDays, setPlatformFlag } from '@/lib/platform-flags'

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

// ── Listing horizon (owner ruling 2026-08-20) ───────────────────────────────────────────────────
//
// How far ahead /events looks. It was a hardcoded 60 days, and a gathering published 64 days out
// simply never appeared, with no explanation on any surface. The owner ruled: remove the cap, make
// it a setting. 0 means no cap and is the default.
//
// Same janitor re-gate as the numbers above: /admin/events admits community host and community
// staff, but this number is platform-wide. The chrome decides what renders; the action is the law.
//
// The revalidate is SCOPED, unlike the series knobs' full-layout purge: this setting is read in
// exactly one loader (app/(main)/events/index-data.ts), so purging /events is enough and a
// site-wide purge would be a cost with no payer.

/** Save the listing horizon in days. Returns the STORED value, so an operator who types -5 or 3.7
 *  sees what actually landed rather than believing their number took. */
export async function saveEventsListingHorizon(days: number): Promise<number> {
  const { profileId } = await requireAdmin('janitor')
  const stored = await setEventsListingHorizonDays(days, profileId)
  revalidatePath('/events')
  revalidatePath('/admin/events')
  return stored
}

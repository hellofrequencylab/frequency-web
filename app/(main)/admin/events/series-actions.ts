'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { saveSeriesDisplayConfig, type SeriesDisplayConfig } from '@/lib/events/series-config'

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

import 'server-only'

// THE FEATURE BUILDER HOLD (LIVE-2481): what a signed-out visitor built, kept in one httpOnly cookie while they sign
// in, then saved by app/finish/[feature]/route.ts and dropped. A cookie, not a row: a visitor who never finishes
// signing in leaves nothing behind. One hold at a time; a newer one replaces it.

import { cookies } from 'next/headers'
import { isFeatureId, type FeatureId } from './catalog'
import { cleanDraft, missingField, type FeatureDraft } from './draft'

const FEATURE_HOLD_COOKIE = 'fq_feature_hold'
/** Long enough for a magic link opened tomorrow morning, short enough not to linger. */
const MAX_AGE = 60 * 60 * 24 * 3

interface FeatureHold {
  feature: FeatureId
  draft: FeatureDraft
}

// authz-ok: writes only the caller's OWN httpOnly cookie. No database touch. Not an action.
export async function writeFeatureHold(hold: FeatureHold): Promise<void> {
  ;(await cookies()).set(FEATURE_HOLD_COOKIE, JSON.stringify({ feature: hold.feature, draft: cleanDraft(hold.feature, hold.draft) }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
}

// authz-ok: reads only the caller's OWN httpOnly cookie. No database touch.
export async function readFeatureHold(): Promise<FeatureHold | null> {
  const raw = (await cookies()).get(FEATURE_HOLD_COOKIE)?.value
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { feature?: unknown; draft?: unknown }
    if (!isFeatureId(v.feature)) return null
    const draft = cleanDraft(v.feature, v.draft)
    return missingField(v.feature, draft) ? null : { feature: v.feature, draft }
  } catch {
    return null
  }
}

export async function clearFeatureHold(): Promise<void> {
  ;(await cookies()).delete(FEATURE_HOLD_COOKIE)
}

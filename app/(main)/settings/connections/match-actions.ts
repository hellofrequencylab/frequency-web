'use server'

// Match-preference actions (Resonance Feed Phase 5, ADR-419). The member opts into
// romance matching + the astrology signal and enters birth data. Self-authorized:
// only ever writes the caller's own member_match_prefs row (profile_id = caller), so
// the admin-client upsert is scoped to the caller and can touch no one else.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import type { BirthData } from '@/lib/match/prefs'

// What a member may declare they're open to. 'community' (the platonic default) and
// 'romance'. Kept to a known set so the column can never carry junk.
const KNOWN_INTENTS = new Set(['community', 'romance'])

export interface SaveMatchPrefsInput {
  romanceMode?: boolean
  astrologyOptIn?: boolean
  connectIntent?: string[]
  /** Birth date 'YYYY-MM-DD' (the sun-sign input); empty string clears it. */
  birthDate?: string
}

export async function saveMatchPrefsAction(input: SaveMatchPrefsInput): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in to change your settings.')

  const patch: Record<string, unknown> = { profile_id: me, updated_at: new Date().toISOString() }

  if (typeof input.romanceMode === 'boolean') patch.romance_mode = input.romanceMode
  if (typeof input.astrologyOptIn === 'boolean') patch.astrology_opt_in = input.astrologyOptIn

  if (input.connectIntent !== undefined) {
    const clean = input.connectIntent.filter((i) => KNOWN_INTENTS.has(i))
    patch.connect_intent = clean.length ? Array.from(new Set(clean)) : ['community']
  }

  if (input.birthDate !== undefined) {
    const d = input.birthDate.trim()
    if (d === '') {
      patch.birth_data = null
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail('Enter your birth date as YYYY-MM-DD.')
      const year = Number(d.slice(0, 4))
      if (year < 1900 || year > 2025) return fail('That birth year looks off.')
      const birth: BirthData = { date: d }
      patch.birth_data = birth
    }
  }

  // member_match_prefs is reached untyped until the types regenerate (ADR-246).
  // Self-scoped: profile_id is ALWAYS the caller.
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      upsert: (rows: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<{ error: unknown }>
    }
  }
  const { error } = await admin.from('member_match_prefs').upsert(patch, { onConflict: 'profile_id' })
  if (error) return fail('Could not save your match preferences.')

  revalidatePath('/settings/connections')
  revalidatePath('/feed')
  return ok()
}

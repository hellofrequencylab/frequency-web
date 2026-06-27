// Member match preferences (Resonance Feed Phase 5, ADR-419). Reads the Phase 0
// member_match_prefs row that Phases 0 to 4 only RESERVED: the opt-in connect intent,
// romance mode, astrology opt-in, and birth data. Activated here. Owner-RLS table,
// reached untyped until the generated types regenerate (ADR-246). Fail-safe defaults.

import { createAdminClient } from '@/lib/supabase/admin'

export interface BirthData {
  /** 'YYYY-MM-DD'. The only field the sun-sign engine needs. */
  date: string
  /** Reserved for a future fuller chart (unused today). */
  time?: string | null
  place?: { label: string; lat?: number | null; lng?: number | null } | null
}

export interface MatchPrefs {
  /** What kinds of connection the member is open to. 'community' is the default. */
  connectIntent: string[]
  /** Opted into romance matching (off by default). Only ever paired with other opt-ins. */
  romanceMode: boolean
  /** Opted into the astrology compatibility signal (off by default). */
  astrologyOptIn: boolean
  /** Birth data, when provided. null until the member enters it. */
  birthData: BirthData | null
}

export const DEFAULT_MATCH_PREFS: MatchPrefs = {
  connectIntent: ['community'],
  romanceMode: false,
  astrologyOptIn: false,
  birthData: null,
}

interface RawPrefRow {
  profile_id: string
  connect_intent: string[] | null
  romance_mode: boolean | null
  astrology_opt_in: boolean | null
  birth_data: BirthData | null
}

function toPrefs(r: RawPrefRow | null): MatchPrefs {
  if (!r) return DEFAULT_MATCH_PREFS
  return {
    connectIntent: Array.isArray(r.connect_intent) && r.connect_intent.length ? r.connect_intent : ['community'],
    romanceMode: r.romance_mode === true,
    astrologyOptIn: r.astrology_opt_in === true,
    birthData: r.birth_data ?? null,
  }
}

/** Untyped handle for member_match_prefs (ADR-246). */
function prefsTable() {
  return createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: RawPrefRow | null }> }
        in: (col: string, v: string[]) => Promise<{ data: RawPrefRow[] | null }>
      }
    }
  }
}

/** The caller's match prefs, defaults when no row exists. Fail-safe. */
export async function getMyMatchPrefs(profileId: string): Promise<MatchPrefs> {
  try {
    const { data } = await prefsTable().from('member_match_prefs').select('*').eq('profile_id', profileId).maybeSingle()
    return toPrefs(data)
  } catch {
    return DEFAULT_MATCH_PREFS
  }
}

/** Match prefs for many profiles at once (the matching reads). Missing rows omitted. */
export async function getMatchPrefsFor(profileIds: string[]): Promise<Map<string, MatchPrefs>> {
  const out = new Map<string, MatchPrefs>()
  if (profileIds.length === 0) return out
  try {
    const { data } = await prefsTable().from('member_match_prefs').select('*').in('profile_id', profileIds)
    for (const r of (data ?? []) as RawPrefRow[]) out.set(r.profile_id, toPrefs(r))
  } catch {
    // fail-safe: empty map -> callers treat everyone as default (no romance, no astro)
  }
  return out
}

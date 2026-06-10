// Operator-tunable Vera config (AI-VERA.md). A janitor edits this from /admin/vera to
// shape Vera's style, her live responses, and the induction/funnel copy — no deploy.
// Single JSON row (vera_config); defaults live here. Server-only; not in database.types
// yet (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ModelTier } from '@/lib/ai/models'
import { VERA as COPY, BETA_OATHS, HEARD_ABOUT } from '@/lib/onboarding/beta-script'

export interface VeraInductionCopy {
  oathHeading: string
  oathBody: string
  introHeading: string
  introBody: string
  /** Labels for the three founder oaths (order matches BETA_OATHS). */
  oathLabels: string[]
  /** "How did you hear about us?" options. */
  heardAbout: string[]
}

export interface VeraConfig {
  /** Extra style guidance appended to Vera's system prompt. */
  styleNote: string
  /** Default voice register (AI-VERA §2). */
  register: 'cool' | 'hot'
  /** Model tier for the live loop (ADR-041). */
  tier: ModelTier
  /** Soft cap on reply length (instructed in the prompt). */
  maxReplyChars: number
  /** Vera's opening line in the concierge. */
  greeting: string
  induction: VeraInductionCopy
}

export const DEFAULT_VERA_CONFIG: VeraConfig = {
  styleNote: '',
  register: 'cool',
  tier: 'haiku',
  maxReplyChars: 320,
  greeting:
    "Hey, I'm really glad you're here. I'm Vera; I look after this place and the people in it. What's alive for you today? Wherever you're starting from is the right place to start.",
  induction: {
    oathHeading: COPY.oath.heading,
    oathBody: COPY.oath.body,
    introHeading: COPY.intro.heading,
    introBody: COPY.intro.body,
    oathLabels: BETA_OATHS.map((o) => o.label),
    heardAbout: [...HEARD_ABOUT],
  },
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Current config, merged over defaults. Never throws (defaults on any failure). */
export async function getVeraConfig(): Promise<VeraConfig> {
  try {
    const { data } = await db().from('vera_config').select('config').eq('id', 'singleton').maybeSingle()
    const stored = ((data as { config?: Partial<VeraConfig> } | null)?.config ?? {}) as Partial<VeraConfig>
    return {
      ...DEFAULT_VERA_CONFIG,
      ...stored,
      induction: { ...DEFAULT_VERA_CONFIG.induction, ...(stored.induction ?? {}) },
    }
  } catch {
    return DEFAULT_VERA_CONFIG
  }
}

/** Persist a (partial) config patch, merged over the current value. */
export async function saveVeraConfig(patch: Partial<VeraConfig>, updatedBy?: string | null): Promise<void> {
  const current = await getVeraConfig()
  const next: VeraConfig = {
    ...current,
    ...patch,
    induction: { ...current.induction, ...(patch.induction ?? {}) },
  }
  await db()
    .from('vera_config')
    .upsert(
      { id: 'singleton', config: next, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
      { onConflict: 'id' },
    )
}

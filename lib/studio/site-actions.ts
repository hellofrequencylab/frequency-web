// Governed site-action registry (PI.4 / ADR-167) — the SAFETY CORE of the AI Studio.
//
// The AI can recommend changes, and Admin/Janitor can apply them with one click — but
// ONLY from this allow-list. Each action is small, reversible, and audited; the AI can
// never invent an arbitrary backend mutation, because a recommendation that doesn't carry
// a registered `key` (with params that pass `validateActionParams`) is advisory-only.
//
// This module is PURE (metadata + validation) — the actual apply/revert IO lives in the
// gated server action (app/(main)/admin/studio/actions.ts), the same split as the trait
// registry (definitions here, effects elsewhere).

import type { CommunityRole } from '@/lib/core/roles'

export type SiteActionKey = 'reindex_help' | 'set_flag'

export interface SiteActionDef {
  key: SiteActionKey
  label: string
  description: string
  /** Lowest community role allowed to apply (admin ⇒ admin + janitor). */
  minRole: CommunityRole
  /** Whether `revert` is meaningful (a flag flips back; a reindex doesn't). */
  reversible: boolean
}

export const SITE_ACTIONS: Record<SiteActionKey, SiteActionDef> = {
  reindex_help: {
    key: 'reindex_help',
    label: 'Re-index the help center',
    description: 'Rebuild the help search index from the current articles. Idempotent and safe.',
    minRole: 'admin',
    reversible: false,
  },
  set_flag: {
    key: 'set_flag',
    label: 'Set a platform flag',
    description: 'Toggle an allow-listed platform flag (e.g. AI on/off, demo content). Reversible; audited.',
    minRole: 'admin',
    reversible: true,
  },
}

/** Flags the Studio is permitted to toggle — a deliberately small, reversible set. */
export const TOGGLEABLE_FLAGS = ['ai_enabled', 'demo_mode'] as const
export type ToggleableFlag = (typeof TOGGLEABLE_FLAGS)[number]

export function isSiteAction(key: unknown): key is SiteActionKey {
  return typeof key === 'string' && key in SITE_ACTIONS
}

export function isToggleableFlag(key: unknown): key is ToggleableFlag {
  return typeof key === 'string' && (TOGGLEABLE_FLAGS as readonly string[]).includes(key)
}

/** Validate the params for an action. Returns a typed, cleaned param object or null —
 *  fail-closed: an unknown action or malformed params can't be applied. */
export function validateActionParams(
  key: SiteActionKey,
  params: Record<string, unknown>,
): Record<string, unknown> | null {
  switch (key) {
    case 'reindex_help':
      return {} // no params
    case 'set_flag': {
      const flag = params.flag
      const value = params.value
      if (!isToggleableFlag(flag) || typeof value !== 'boolean') return null
      return { flag, value }
    }
    default:
      return null
  }
}

// What the composer can send (LIVE-682, the S6 owner call): every member gets Post, Poll, Ask and a
// Practice / Journey share; a leader's Dispatch gets a scope picker limited to the tiers they lead.
// PURE (no IO): the composer renders from it and createPost re-checks against it, so the offer and
// the gate are one rule.

import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

export const POLL_LIMITS = { minOptions: 2, maxOptions: 6, label: 80 } as const

/** Tidy a poll's options: trimmed, empties dropped, duplicates (case-insensitive) dropped, each
 *  capped. Returns the options or an error a person can act on. PURE. */
export function normalizePollOptions(raw: readonly unknown[]): { ok: true; options: string[] } | { ok: false; error: string } {
  const seen = new Set<string>()
  const options: string[] = []
  for (const r of raw) {
    const label = String(r ?? '').replace(/\s+/g, ' ').trim()
    if (!label) continue
    if (label.length > POLL_LIMITS.label) return { ok: false, error: `Keep each option under ${POLL_LIMITS.label} characters.` }
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    options.push(label)
  }
  if (options.length < POLL_LIMITS.minOptions) return { ok: false, error: 'A poll needs at least two different options.' }
  if (options.length > POLL_LIMITS.maxOptions) return { ok: false, error: `A poll holds at most ${POLL_LIMITS.maxOptions} options.` }
  return { ok: true, options }
}

// ── The Dispatch scope picker ───────────────────────────────────────────────────────────────────
//
// A Dispatch is an announcement post. Its reach is the post's visibility:
//   circle   · `group`   the Circle it is posted in
//   hub      · `cluster` the Circle and everyone its Hub or Channel reaches (today's Dispatch)
//   nexus    · `region`  everyone in the author's region (the Nexus tier)
//   everyone · `public`  the whole community
// A host leads a Circle, so a host gets circle and hub. A Mentor adds nexus. Platform staff add
// everyone. A Guide leads a Hub, which hub already reaches.

export type DispatchScope = 'circle' | 'hub' | 'nexus' | 'everyone'

export const DISPATCH_SCOPE_LABEL: Record<DispatchScope, string> = {
  circle: 'This Circle',
  hub: 'The Hub',
  nexus: 'The Nexus',
  everyone: 'Everyone',
}

export const DISPATCH_VISIBILITY: Record<DispatchScope, 'group' | 'cluster' | 'region' | 'public'> = {
  circle: 'group',
  hub: 'cluster',
  nexus: 'region',
  everyone: 'public',
}

/** The Dispatch scopes a member may pick, widest last. Empty for a member who cannot Dispatch. PURE. */
export function dispatchScopesFor(v: {
  communityRole: CommunityRole | null | undefined
  isStaff: boolean
  hasRegion: boolean
}): DispatchScope[] {
  const out: DispatchScope[] = []
  if (atLeastRole(v.communityRole, 'host') || v.isStaff) out.push('circle', 'hub')
  if ((atLeastRole(v.communityRole, 'mentor') || v.isStaff) && v.hasRegion) out.push('nexus')
  if (v.isStaff) out.push('everyone')
  return out
}

export function isDispatchScope(v: unknown): v is DispatchScope {
  return v === 'circle' || v === 'hub' || v === 'nexus' || v === 'everyone'
}

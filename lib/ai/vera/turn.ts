import 'server-only'

// One concierge turn, shared by the two doors that run it (ADR-1287, PROG-E8):
//   • app/onboarding/vera-actions.ts `conciergeTurn` — the server action, whole reply at once.
//   • app/api/vera/turn/route.ts — the streaming door, the same turn with `onText` wired to an
//     NDJSON response so the member watches Vera's reply arrive.
// Both doors resolve the same identity, the same memory and support context, and fall back to
// the same deterministic concierge, because a member must get an answer whether or not the
// kernel is on (AI-VERA §4). Write proposals are RETURNED, never executed here (ADR-028).
//
// Deliberately PUBLIC: the concierge serves signed-out visitors. `callerIdentity` is optional
// personalization (null for anonymous, and the turn proceeds either way), not a gate.

import { createClient } from '@/lib/supabase/server'
import { aiEnabled } from '@/lib/ai'
import { isStaff, type WebRole } from '@/lib/core/roles'
import { getMemberContext } from '@/lib/ai/memory'
import { supportSummaryForVera } from '@/lib/support/store'
import { runVeraTurn } from './loop'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { veraSpaceGuide } from './space-guide'
import { SPACE_FUNCTIONS, spaceFunctionDef, spaceFunctionEnabled, spaceFunctionMinRole } from '@/lib/spaces/functions'
import { veraSettingsGuide } from './space-settings'
import type { Space } from '@/lib/spaces/types'
import { readSkyMarkersEnabled } from '@/lib/spaces/sky-markers'
import { readHeroConfig } from '@/lib/spaces/hero-config'
import { readCoverScrim, readLogoBackdrop } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import type { VeraReader } from './reader-note'
import { runVeraClaudeTurn, type VeraMessage } from './agent-claude'
import { runAdminLookup } from './admin-lookups'
import type { EntitlementTier } from '@/lib/core/entitlement'
import type { ConciergeStage, ProposedToolCall } from './concierge'

export interface ConciergeTurnResult {
  message: string
  /** 'chat' once the live loop is driving (the deterministic stages no longer apply). */
  stage: ConciergeStage | 'chat'
  proposals: ProposedToolCall[]
  suggestions: string[]
  done: boolean
}

/** The caller's id + both role axes (ADR-208), so Vera can answer to the depth their
 *  permissions allow — operator-to-operator for staff, companion scope for members. */
async function callerIdentity(): Promise<{ id: string; communityRole: string; webRole: WebRole; tier: EntitlementTier } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id, community_role, web_role, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!data?.id) return null
  return {
    id: data.id,
    communityRole: (data.community_role as string) ?? 'member',
    webRole: ((data.web_role as WebRole | null) ?? 'none'),
    // The billing tier feeds the vera_unlimited daily-cap gate (ADR-370). INERT while billing is OFF.
    tier: ((data.membership_tier as EntitlementTier | null) ?? 'free'),
  }
}

/** Whether the caller's own session is staff right now (LIVE-2190), re-read for every operator lookup. */
async function staffNow(): Promise<boolean> {
  const now = await callerIdentity()
  return !!now && isStaff(now.webRole)
}

/** Run one concierge turn. Live loop when the kernel is on (grounded in memory, with the bounded
 *  tools, streamed through `onText` when given); the deterministic concierge otherwise. */
export async function runConciergeTurn(
  stage: string,
  memberText: string,
  history: VeraMessage[] = [],
  opts: {
    onText?: (delta: string, round: number) => void
    /** The caller's IP, so an ANONYMOUS turn still has an actor for the per-actor AI window
     *  (SCAN-736). A null profile and no ip means nobody is throttled, which is the hole both
     *  doors used to have. */
    ip?: string | null
    /** The Space page they are on (LIVE-2147): its settings guide joins the prompt when they help run it. */
    space?: string
  } = {},
): Promise<ConciergeTurnResult> {
  if (aiEnabled()) {
    const ident = await callerIdentity()
    const profileId = ident?.id ?? null
    const actorKey = profileId ?? (opts.ip ? `ip:${opts.ip}` : null)
    const [memberContext, supportSummary, reader, spaceGuide] = profileId
      ? await Promise.all([getMemberContext(profileId), supportSummaryForVera(profileId).catch(() => ''), readerFor(profileId), spaceGuideFor(opts.space, profileId)])
      : [null, '', null, '']
    const viewer = ident
      ? { isOperator: isStaff(ident.webRole), roleLabel: isStaff(ident.webRole) ? ident.webRole : ident.communityRole }
      : null
    const live = await runVeraClaudeTurn({
      history,
      memberText,
      memberContext,
      supportSummary,
      profileId,
      actorKey,
      tier: ident?.tier ?? null,
      viewer,
      reader,
      spaceGuide,
      // The live operator answers (LIVE-2190): only for a staff session, and each lookup re-reads the session.
      adminLookup: viewer?.isOperator ? (question) => runAdminLookup(question, staffNow) : undefined,
      onText: opts.onText,
    })
    if (live) return { message: live.reply, stage: 'chat', proposals: live.proposals, suggestions: live.suggestions, done: false }
  }

  // Deterministic fallback (also the path when AI is off / over budget).
  const turn = await runVeraTurn({ stage: stage === 'chat' ? 'done' : (stage as ConciergeStage), memberText })
  return { message: turn.message, stage: turn.stage, proposals: turn.proposals, suggestions: turn.suggestions, done: turn.done }
}

/** The persona and archetype the member gave at intake (profiles.meta), for Vera's one-line reader note
 *  (ADR-1715). Only those two keys are read; never age or gender. Best-effort: null on any miss. */
async function readerFor(profileId: string): Promise<VeraReader | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('profiles').select('meta').eq('id', profileId).maybeSingle()
    const meta = (data?.meta ?? {}) as { persona?: unknown; archetype?: unknown }
    return {
      persona: typeof meta.persona === 'string' ? meta.persona : null,
      archetype: typeof meta.archetype === 'string' ? meta.archetype : null,
    }
  } catch {
    return null
  }
}

/** Each Space setting Vera may propose that applies to this Space, with its value now (LIVE-2186). The calendar
 *  settings apply only while the Calendar is on, the same door the calendar page uses. */
function settingsNow(space: Space): Record<string, string> {
  const events = spaceFunctionDef('events')
  if (!events || !spaceFunctionEnabled(space, events)) return {}
  return {
    'calendar.time_zone': space.timeZone ?? 'not set (dates use America/Los_Angeles)',
    'calendar.sky_markers': readSkyMarkersEnabled(space.preferences) ? 'on' : 'off',
  }
}

/** The Space page's look settings with their values now (LIVE-2187). Every Space has a page, so these always apply. */
function pageLookNow(space: Space): Record<string, string> {
  const hero = readHeroConfig(space.preferences)
  return {
    'page.cover_style': readCoverScrim(space.preferences),
    'page.logo_backdrop': readLogoBackdrop(space.preferences),
    'page.hero_height': hero.height ?? 'standard',
    'page.hero_buttons': hero.buttonOrientation ?? 'row',
  }
}

/** The settings guide for the Space page they are on (LIVE-2147). Their role comes from the Space's own
 *  capability resolver, never from the request; anyone who cannot edit the Space gets nothing. FAIL-SAFE:
 *  any miss is an empty guide and the turn goes on. */
async function spaceGuideFor(slug: string | undefined, profileId: string): Promise<string> {
  if (!slug) return ''
  try {
    const found = await getSpaceBySlug(slug)
    if (!found) return ''
    // Each area's lowest role now (LIVE-2185), so Vera can say who can use it before proposing a change.
    const minRoles: Record<string, string> = {}
    for (const fn of SPACE_FUNCTIONS) minRoles[fn.key] = spaceFunctionMinRole(found, fn.key) ?? fn.defaultMinRole
    const space = { ...found, minRoles }
    const guide = veraSpaceGuide(space, await getSpaceCapabilities(space, profileId))
    // The settings she may propose (LIVE-2186) ride only an owner's or admin's guide, the one that offers changes.
    return guide.includes('set_space_feature') ? [guide, veraSettingsGuide(found.slug, { ...pageLookNow(found), ...settingsNow(found) })].filter(Boolean).join('\n') : guide
  } catch {
    return ''
  }
}

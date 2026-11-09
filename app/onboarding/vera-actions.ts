'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { VeraMessage } from '@/lib/ai/vera/agent-claude'
import { runConciergeTurn, type ConciergeTurnResult } from '@/lib/ai/vera/turn'
import { VERA_TURN_BODY } from '@/lib/ai/vera/turn-input'
import { MEMBER_CHAT_TOOL_KEYS, requiresConfirmation, validateToolCall } from '@/lib/ai/vera/tools'
import { veraRoleCard, veraSwitchName, veraSwitchable } from '@/lib/ai/vera/space-guide'
import { veraSettingValue, veraSettingWhere } from '@/lib/ai/vera/space-settings'
import { ticketChange } from '@/lib/ai/vera/admin-changes'
import { setTicketFields } from '@/app/(main)/admin/support/actions'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { setSpaceSkyMarkers, setSpaceTimeZone } from '@/app/(main)/spaces/[slug]/settings/calendar/entry-actions'
import { setSpaceCoverScrim, setSpaceHeroLook, setSpaceLogoBackdrop } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { setSpaceFeatureEnabled, setSpaceFeatureMinRole } from '@/app/(main)/spaces/[slug]/manage/modules/actions'
import { executeConfirmedTool } from '@/lib/ai/vera/execute'
import { createAdminClient } from '@/lib/supabase/admin'
import { isError, type ActionResult } from '@/lib/action-result'
import type { CoverScrim, LogoBackdrop } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import type { HeroButtonOrientation, HeroHeight } from '@/lib/spaces/hero-config'
import type { TicketPriority, TicketStatus } from '@/lib/support/types'
import { joinCircle } from '@/app/(main)/circles/actions'

export type { ConciergeTurnResult }

// The tools a MEMBER may run from their own confirm path. Each self-scopes its write to the
// caller (memory, own profile, an intro post in their voice). join_circle is handled separately
// above. Everything else in executeConfirmedTool is an operator-scoped playbook tool. Derived from
// the member chat set (SCAN-738) so what the model may propose and what a member may confirm are
// one list.
const MEMBER_CONFIRMABLE_TOOLS = new Set(
  [...MEMBER_CHAT_TOOL_KEYS].filter((key) => requiresConfirmation(key) && key !== 'join_circle'),
)

/** The caller's IP, the per-actor key for an anonymous Vera turn (same shape as support/actions). */
async function callerIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

async function callerProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

// authz-ok: intentionally PUBLIC — the onboarding concierge serves signed-out visitors. The
// identity lookup inside lib/ai/vera/turn is optional personalization (null for anonymous, and
// the turn proceeds either way), not a gate; write proposals are returned, never executed.
/** One concierge turn, the whole reply at once. The live loop when the kernel is on (grounded in
 *  memory, with the bounded tools); the deterministic concierge otherwise. The streaming door is
 *  app/api/vera/turn (ADR-1287); both run lib/ai/vera/turn, and the client falls back to this one
 *  when a stream cannot be opened. Write proposals are returned, never executed. */
export async function conciergeTurn(stage: string, memberText: string, history: VeraMessage[] = []): Promise<ConciergeTurnResult> {
  // Same bounds as the streaming door, and the same per-IP actor for the AI window (SCAN-736): an
  // anonymous caller used to reach the model with no throttle and no size limit through this door.
  const parsed = VERA_TURN_BODY.safeParse({ stage, text: memberText, history })
  if (!parsed.success) {
    return { message: 'That is more than I can take in one go. Try a shorter message.', stage: 'chat', proposals: [], suggestions: [], done: false }
  }
  const body = parsed.data
  return runConciergeTurn(body.stage, body.text, body.history, { ip: await callerIp() })
}

/** The member confirmed a proposed write — execute it (consent-gated). `message` is what Vera says once a
 *  change landed, when there is something to say (a Space switch says where to switch it back). */
export async function confirmProposal(tool: string, argsJson: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const profileId = await callerProfileId()
  if (!profileId) return { ok: false, error: 'Not signed in.' }
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'Bad arguments.' }
  }

  // join_circle is an app-level action (capacity checks + rewards + redirect), so it's
  // handled here rather than in the lib executor.
  if (tool === 'join_circle') return joinCircleForMember(String(args.circle ?? ''))

  // A Space switch (LIVE-2157) goes through the Module Manager's OWN guarded action, which re-resolves the
  // Space from the slug and re-checks that the caller is its owner or an admin. Money, the plan, the team
  // list and deleting are refused here as well as in the chat, whatever the request carries.
  if (tool === 'set_space_feature') return setSpaceSwitch(args)
  if (tool === 'set_space_role') return setSpaceRole(args)
  if (tool === 'set_space_setting') return setSpaceSetting(args)
  // A ticket change (LIVE-2191) is for the Frequency team only and goes through the support console's own action.
  if (tool === 'set_ticket') return setTicket(args)

  // The member-facing confirm path may run ONLY the small set of member-SAFE, self-scoped
  // tools. executeConfirmedTool ALSO dispatches the operator-only Resonance Engine playbook
  // tools (tag_contact, move_contact_stage, give_gem_gift, save_streak, send_playbook_email,
  // send_intro_email) which treat `profileId` as an AUTHORIZED OPERATOR and act on arbitrary
  // member/contact ids — those are reachable only from the janitor-gated operator path. Without
  // this allow-list, any signed-in member could POST a crafted `tool` to mint themselves Gems or
  // mutate any CRM contact. The member-safe writes all self-scope to `profileId`.
  if (!MEMBER_CONFIRMABLE_TOOLS.has(tool)) return { ok: false, error: 'That action is not available here.' }

  const result = await executeConfirmedTool(profileId, tool, args)
  // A saved profile field shows on the profile and in settings on the next paint (SCAN-740).
  if (tool === 'set_profile_field' && result.ok) {
    revalidatePath('/settings/profile')
    revalidatePath('/people', 'layout')
  }
  return result
}

/** Turn one area of a Space on or off for the owner or an admin who tapped Vera's card (LIVE-2157). */
async function setSpaceSwitch(args: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!validateToolCall('set_space_feature', args).ok) return { ok: false, error: 'That change was not complete. Ask Vera again?' }
  const feature = String(args.feature)
  if (!veraSwitchable(feature)) return { ok: false, error: 'That setting can only be changed by hand in your Space settings.' }
  const slug = String(args.space)
  const on = args.on === true
  const res = await setSpaceFeatureEnabled(slug, feature, on)
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, message: `Done. ${veraSwitchName(feature)} is ${on ? 'on' : 'off'}. You can switch it back any time at /spaces/${slug}/manage/modules.` }
}

/** Set the lowest role that can use one area of a Space, for the owner or an admin who tapped Vera's card
 *  (LIVE-2185). Same refusals as a switch; the Module Manager's own action re-checks the caller and the role. */
async function setSpaceRole(args: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!validateToolCall('set_space_role', args).ok) return { ok: false, error: 'That change was not complete. Ask Vera again?' }
  const feature = String(args.feature)
  const role = String(args.role)
  if (!veraSwitchable(feature) || !veraRoleCard(feature, role)) return { ok: false, error: 'That setting can only be changed by hand in your Space settings.' }
  const slug = String(args.space)
  const res = await setSpaceFeatureMinRole(slug, feature, role)
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, message: `Done. You can change who can use ${veraSwitchName(feature)} any time at /spaces/${slug}/manage/modules.` }
}

/** Each setting on Vera's list (lib/ai/vera/space-settings.ts) and the settings page action that writes it.
 *  The value is already checked against the list's closed values before it gets here. */
const SETTING_WRITERS: Record<string, (slug: string, value: string) => Promise<ActionResult>> = {
  'calendar.time_zone': async (slug, value) => await setSpaceTimeZone(slug, value),
  'calendar.sky_markers': async (slug, value) => await setSpaceSkyMarkers(slug, value === 'on'),
  'page.cover_style': (slug, value) => setSpaceCoverScrim(slug, value as CoverScrim),
  'page.logo_backdrop': (slug, value) => setSpaceLogoBackdrop(slug, value as LogoBackdrop),
  'page.hero_height': (slug, value) => setSpaceHeroLook(slug, { height: value as HeroHeight }),
  'page.hero_buttons': (slug, value) => setSpaceHeroLook(slug, { buttonOrientation: value as HeroButtonOrientation }),
}

/** Change one Space setting for someone who tapped Vera's card (LIVE-2186). Each setting goes through its
 *  settings page's OWN guarded action, which re-resolves the Space and re-checks the caller; a setting or value
 *  that is not on Vera's list is refused here whatever the request carries. */
async function setSpaceSetting(args: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!validateToolCall('set_space_setting', args).ok) return { ok: false, error: 'That change was not complete. Ask Vera again?' }
  const setting = String(args.setting)
  const value = veraSettingValue(setting, args.value)
  if (value === null) return { ok: false, error: 'That setting can only be changed by hand in your Space settings.' }
  const slug = String(args.space)
  const write = Object.hasOwn(SETTING_WRITERS, setting) ? SETTING_WRITERS[setting] : null
  const res = write ? await write(slug, value) : null
  if (!res) return { ok: false, error: 'That setting can only be changed by hand in your Space settings.' }
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, message: `Done. You can change it back any time at ${veraSettingWhere(setting, slug)}.` }
}

/** Change one support ticket's status or priority for a team member who tapped Vera's card (LIVE-2191). Only a
 *  staff session finds the ticket at all, and the support console's own setTicketFields re-checks the caller. */
async function setTicket(args: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!validateToolCall('set_ticket', args).ok) return { ok: false, error: 'That change was not complete. Ask Vera again?' }
  const change = ticketChange(args.ticket, args.field, args.value)
  if (!change) return { ok: false, error: 'That ticket change can only be made by hand at /admin/support.' }
  const me = await getCallerProfile()
  if (!me || !isStaff(me.webRole)) return { ok: false, error: 'That action is not available here.' }
  const { data } = await createAdminClient().from('support_tickets').select('id').eq('ref', change.ref).maybeSingle()
  if (!data?.id) return { ok: false, error: `There is no support ticket #${change.ref}.` }
  const res = await setTicketFields(data.id, change.field === 'status' ? { status: change.value as TicketStatus } : { priority: change.value as TicketPriority })
  if (isError(res)) return { ok: false, error: res.error }
  return { ok: true, message: `Done. Ticket #${change.ref} is updated. You can change it back any time at /admin/support/${data.id}.` }
}

/** Resolve a circle (by slug, then name) and join the member via the canonical
 *  joinCircle — which enforces capacity, awards, and redirects to the circle on success. */
async function joinCircleForMember(ref: string): Promise<{ ok: boolean; error?: string }> {
  const term = ref.trim()
  if (!term) return { ok: false, error: 'No circle specified.' }
  const admin = createAdminClient()
  const bySlug = await admin.from('circles').select('id, slug').eq('slug', term).eq('is_demo', false).maybeSingle()
  let circle = bySlug.data
  if (!circle) {
    const byName = await admin.from('circles').select('id, slug').ilike('name', `%${term}%`).eq('is_demo', false).limit(1)
    circle = (byName.data ?? [])[0] ?? null
  }
  if (!circle) return { ok: false, error: `Couldn't find a circle matching "${term}".` }
  // Redirects to /circles/<slug> on success; returns a failure result (capacity,
  // region cap, …) otherwise — surface it instead of reporting a false success.
  const res = await joinCircle(circle.id, circle.slug)
  if (res && isError(res)) return { ok: false, error: res.error }
  return { ok: true }
}

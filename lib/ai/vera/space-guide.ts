// VERA KNOWS THE SPACE'S SETTINGS (LIVE-2147, Vera assistants plan phase V0, explain mode). When someone who
// helps run a Space asks Vera about it from inside that Space, her prompt carries the Space's own settings,
// DERIVED from THE Space module catalog (lib/admin/modules/space-modules.ts SPACE_MODULES via the manifest), so
// the list can never drift from the menu: one line per area with what it does and the exact place it lives,
// and which areas are turned off. Explain only: Vera holds no setting-change tool here, so the guide tells her
// to say where to change it, never that she changed it. Money, the plan and deleting the Space are named as
// always the owner's to change. Pure: no I/O, the caller resolves the Space and the viewer's role.
//
// PROPOSE MODE (LIVE-2157, phase V3): for the owner or an admin (canManageMembers, the same authority the Module
// Manager's switch checks), the guide also lists the areas she may PROPOSE turning on or off with the
// set_space_feature tool. She never changes one herself: the proposal is a card, the person taps it, and the
// Module Manager's own guarded action does the write. Money paths, the plan, the team list and deleting are
// never offered (veraSwitchable). An editor keeps explain only.
//
// WHO CAN USE IT (LIVE-2185, phase V3): the same owner or admin may also PROPOSE the lowest role that can use
// one of those same areas with the set_space_role tool, from the role ladder the Module Manager's picker
// offers. The caller hands in each area's role now (space.minRoles), so this file still loads only the
// catalog; the tap goes through the Module Manager's own guarded setSpaceFeatureMinRole.

import { SPACE_MODULES, isModuleEnabled, spaceModuleManifest } from '@/lib/admin/modules/space-modules'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

/** Areas whose settings are always the owner's to change by hand: money paths, the plan and deleting. */
const OWNER_ONLY = new Set(['space.offerings', 'space.payments', 'space.billing', 'space.donations', 'space.memberships', 'space.services', 'space.chapters', 'space.danger'])

/** Switches never offered from chat even though the Module Manager has them: the team list itself. */
const NEVER_FROM_CHAT = new Set(['members'])

/** The function key a module's on/off rides, or null for an always-on area. */
function switchOf(m: { gate: { kind: string; fn?: string } }): string | null {
  return m.gate.kind === 'feature' && m.gate.fn ? m.gate.fn : null
}

/** Whether Vera may propose turning this function on or off: a real switch in the Space catalog that no
 *  owner-only area (money, the plan, deleting) rides, and not the team list. Server-checked again on confirm. */
export function veraSwitchable(fn: string): boolean {
  if (NEVER_FROM_CHAT.has(fn)) return false
  const riders = SPACE_MODULES.filter((m) => switchOf(m) === fn)
  return riders.length > 0 && riders.every((m) => !OWNER_ONLY.has(m.id) && !(m.parent && OWNER_ONLY.has(m.parent)))
}

/** The name of the area a switch belongs to (the first area that rides it), for her "done" line. */
export function veraSwitchName(fn: string): string {
  return SPACE_MODULES.find((m) => switchOf(m) === fn)?.label ?? fn
}

/** The plain words on the confirm card: which area, and every other area that rides the same switch. */
export function veraSwitchCard(fn: string, on: boolean): string {
  const rest = SPACE_MODULES.filter((m) => switchOf(m) === fn).map((m) => m.label).slice(1)
  const also = rest.length ? ` This also turns ${on ? 'on' : 'off'} ${rest.join(', ')}.` : ''
  return `Turn ${veraSwitchName(fn)} ${on ? 'on' : 'off'} in this Space?${also}`
}

/** The role ladder the Module Manager's "lowest role" picker offers, lowest first, with its own labels. */
const ROLE_LADDER: Record<string, string> = { viewer: 'Member', editor: 'Editor', moderator: 'Moderator', admin: 'Admin' }

/** Who a lowest role lets in, in the card's words. */
const ROLE_WHO: Record<string, string> = { viewer: 'every member', editor: 'editors and up', moderator: 'moderators and up', admin: 'only admins' }

/** The plain words on the confirm card for a lowest-role change, or null for a role the ladder does not
 *  have. Server-checked again on confirm. */
export function veraRoleCard(fn: string, role: string): string | null {
  const who = Object.hasOwn(ROLE_WHO, role) ? ROLE_WHO[role] : null
  return who ? `Let ${who} use ${veraSwitchName(fn)} in this Space?` : null
}

const ROLE_WORDS: Record<string, string> = { admin: 'an admin', editor: 'an editor', moderator: 'a moderator', member: 'a member' }

/** The settings guide for one Space, as the lines Vera's prompt carries. Empty when the viewer cannot help run
 *  it, so a plain member or a visitor never gets the back office read to them. */
export function veraSpaceGuide(
  space: { name: string; slug: string; entitlements: unknown; minRoles?: Record<string, string> },
  viewer: { isOwner: boolean; role: string | null; canEditProfile: boolean; canManageMembers?: boolean },
): string {
  if (!viewer.canEditProfile) return ''
  const raw = space.entitlements
  const entitlements = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<Record<SpaceFunctionKey, boolean>>) : {}
  const home = `/spaces/${space.slug}/manage`
  const on = spaceModuleManifest(entitlements)
  const off = SPACE_MODULES.filter((m) => !isModuleEnabled(m, entitlements)).map((m) => m.label)
  const who = viewer.isOwner ? 'its owner' : ROLE_WORDS[viewer.role ?? ''] ?? 'part of its team'
  const switches = [...new Set(SPACE_MODULES.map(switchOf).filter((fn): fn is string => !!fn && veraSwitchable(fn)))]
  const lines = on.map((m) => `- ${m.label}: ${m.desc ?? ''} Where: ${m.deepLink ? m.deepLink(space.slug) : home}${OWNER_ONLY.has(m.id) ? ' (owner changes it by hand)' : ''}`)
  return [
    `THE SPACE THEY ARE IN: "${space.name}" (/spaces/${space.slug}). They help run it as ${who}.`,
    'They may ask what a setting does or where to find it. Answer from the list below, name the exact place, and offer the link.',
    viewer.canManageMembers
      ? `You can PROPOSE turning one of the switches below on or off with the set_space_feature tool (space "${space.slug}"), and the lowest role that can use one of them with the set_space_role tool (roles, lowest first: ${Object.entries(ROLE_LADDER).map(([k, v]) => `${k} = ${v}`).join(', ')}). It shows them a card and nothing changes until they tap it, so never say you changed it. Any other setting you cannot change from this chat: tell them exactly where to do it. If a setting is not on this list, say you do not know rather than guess.`
      : 'You cannot change a setting from this chat. Say so plainly and tell them exactly where to do it; never say you changed one. If a setting is not on this list, say you do not know rather than guess.',
    'Money, the plan and billing, and deleting the Space are always changed by the owner by hand.',
    'Its settings (what each does, and where it lives):',
    ...lines,
    off.length ? `Turned off in this Space (turn one on from ${home}/modules): ${off.join(', ')}.` : '',
    viewer.canManageMembers && switches.length
      ? `Switches you may propose (feature: now): ${switches.map((fn) => `${fn}: ${entitlements[fn as SpaceFunctionKey] === false ? 'off' : 'on'}`).join(', ')}.`
      : '',
    viewer.canManageMembers && switches.length && space.minRoles
      ? `Who can use each now (feature: lowest role): ${switches.filter((fn) => space.minRoles?.[fn]).map((fn) => `${fn}: ${space.minRoles?.[fn]}`).join(', ')}.`
      : '',
  ].filter(Boolean).join('\n')
}

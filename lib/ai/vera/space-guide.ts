// VERA KNOWS THE SPACE'S SETTINGS (LIVE-2147, Vera assistants plan phase V0, explain mode). When someone who
// helps run a Space asks Vera about it from inside that Space, her prompt carries the Space's own settings,
// DERIVED from THE Space module catalog (lib/admin/modules/space-modules.ts SPACE_MODULES via the manifest), so
// the list can never drift from the menu: one line per area with what it does and the exact place it lives,
// and which areas are turned off. Explain only: Vera holds no setting-change tool here, so the guide tells her
// to say where to change it, never that she changed it. Money, the plan and deleting the Space are named as
// always the owner's to change. Pure: no I/O, the caller resolves the Space and the viewer's role.

import { SPACE_MODULES, isModuleEnabled, spaceModuleManifest } from '@/lib/admin/modules/space-modules'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

/** Areas whose settings are always the owner's to change by hand: money paths, the plan and deleting. */
const OWNER_ONLY = new Set(['space.offerings', 'space.payments', 'space.billing', 'space.donations', 'space.memberships', 'space.services', 'space.chapters', 'space.danger'])

const ROLE_WORDS: Record<string, string> = { admin: 'an admin', editor: 'an editor', moderator: 'a moderator', member: 'a member' }

/** The settings guide for one Space, as the lines Vera's prompt carries. Empty when the viewer cannot help run
 *  it, so a plain member or a visitor never gets the back office read to them. */
export function veraSpaceGuide(
  space: { name: string; slug: string; entitlements: unknown },
  viewer: { isOwner: boolean; role: string | null; canEditProfile: boolean },
): string {
  if (!viewer.canEditProfile) return ''
  const raw = space.entitlements
  const entitlements = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<Record<SpaceFunctionKey, boolean>>) : {}
  const home = `/spaces/${space.slug}/manage`
  const on = spaceModuleManifest(entitlements)
  const off = SPACE_MODULES.filter((m) => !isModuleEnabled(m, entitlements)).map((m) => m.label)
  const who = viewer.isOwner ? 'its owner' : ROLE_WORDS[viewer.role ?? ''] ?? 'part of its team'
  const lines = on.map((m) => `- ${m.label}: ${m.desc ?? ''} Where: ${m.deepLink ? m.deepLink(space.slug) : home}${OWNER_ONLY.has(m.id) ? ' (owner changes it by hand)' : ''}`)
  return [
    `THE SPACE THEY ARE IN: "${space.name}" (/spaces/${space.slug}). They help run it as ${who}.`,
    'They may ask what a setting does or where to find it. Answer from the list below, name the exact place, and offer the link.',
    'You cannot change a setting from this chat. Say so plainly and tell them exactly where to do it; never say you changed one. If a setting is not on this list, say you do not know rather than guess.',
    'Money, the plan and billing, and deleting the Space are always changed by the owner by hand.',
    'Its settings (what each does, and where it lives):',
    ...lines,
    off.length ? `Turned off in this Space (turn one on from ${home}/modules): ${off.join(', ')}.` : '',
  ].filter(Boolean).join('\n')
}

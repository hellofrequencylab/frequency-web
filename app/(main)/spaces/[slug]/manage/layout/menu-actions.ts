'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceCanUseFullWebsite } from '@/lib/spaces/entitlements'
import { type ActionResult, fail } from '@/lib/action-result'
import { menuEditorData, resetMenu, saveLogo, saveMenu, type MenuAuth, type MenuEditorData } from '@/lib/spaces/site-menu-core'

// THE MENU EDITOR'S SERVER HALF (lib/spaces/site-menu.ts): one saved menu and one header logo on the
// Space, read and written from the Space console and from the website editor alike, so both platforms
// stay in step. Every call re-gates the caller as an editor (owner / admin / editor) of the Space; menu
// writes also need the Space's plan to include menu editing (space_full_website, Business and up).
// The header logo is open to every plan. The reads and writes live in lib/spaces/site-menu-core.ts; the
// website editor, whose host never receives the session cookie, calls the same core through
// lib/sites/editor/menu-actions.ts (SCAN-832).

async function authorize(slug: string): Promise<MenuAuth | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile) return null
  const prefs = space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences) ? (space.preferences as Record<string, unknown>) : {}
  return { space, preferences: prefs, canEdit: spaceCanUseFullWebsite(space) }
}

export async function getSiteMenuEditorData(slug: string): Promise<MenuEditorData | null> {
  const auth = await authorize(slug)
  return auth ? menuEditorData(auth) : null
}

export async function saveSiteMenu(slug: string, input: unknown): Promise<ActionResult> {
  const auth = await authorize(slug)
  if (!auth) return fail('You do not have access to edit this menu.')
  return saveMenu(auth, slug, input)
}

export async function resetSiteMenu(slug: string): Promise<ActionResult> {
  const auth = await authorize(slug)
  if (!auth) return fail('You do not have access to edit this menu.')
  return resetMenu(auth, slug)
}

export async function saveHeaderLogo(slug: string, input: unknown): Promise<ActionResult> {
  const auth = await authorize(slug)
  if (!auth) return fail('You do not have access to edit this logo.')
  return saveLogo(auth, slug, input)
}

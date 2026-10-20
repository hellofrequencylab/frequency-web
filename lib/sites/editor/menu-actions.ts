'use server'

import { type ActionResult, fail } from '@/lib/action-result'
import { spaceCanUseFullWebsite } from '@/lib/spaces/entitlements'
import { storeSpaceImage } from '@/lib/spaces/space-image-store'
import { menuEditorData, resetMenu, saveLogo, saveMenu, type MenuAuth, type MenuEditorData } from '@/lib/spaces/site-menu-core'
import { authorizeWebsiteEditor } from './authorization'

// THE MENU EDITOR ON THE SITE'S OWN HOST (SCAN-832). The website editor runs on <slug>.frequencylocal.com or a
// custom domain, where the Frequency session cookie never arrives, so the Space console's menu actions
// (getCallerProfile) authorize nobody there. These twins prove the caller with the host-bound site-admin pass
// (authorizeWebsiteEditor) and then run the very same reads and writes, so the menu and logo stay one thing
// on both platforms.

async function authorize(host: string): Promise<MenuAuth | null> {
  const auth = await authorizeWebsiteEditor(host)
  if (!auth) return null
  return { space: auth.space, preferences: auth.preferences as Record<string, unknown>, canEdit: spaceCanUseFullWebsite(auth.space) }
}

const ENDED = 'Your editing session ended. Reopen the builder to sign in.'

export async function loadWebsiteMenu(host: string): Promise<MenuEditorData | null> {
  const auth = await authorize(host)
  return auth ? menuEditorData(auth) : null
}

export async function saveWebsiteMenu(host: string, input: unknown): Promise<ActionResult> {
  const auth = await authorize(host)
  return auth ? saveMenu(auth, auth.space.slug, input) : fail(ENDED)
}

export async function resetWebsiteMenu(host: string): Promise<ActionResult> {
  const auth = await authorize(host)
  return auth ? resetMenu(auth, auth.space.slug) : fail(ENDED)
}

export async function saveWebsiteHeaderLogo(host: string, input: unknown): Promise<ActionResult> {
  const auth = await authorize(host)
  return auth ? saveLogo(auth, auth.space.slug, input) : fail(ENDED)
}

export async function uploadWebsiteLogo(host: string, formData: FormData): Promise<{ url: string } | { error: string }> {
  const auth = await authorize(host)
  return auth ? storeSpaceImage(auth.space.id, 'logo', formData) : { error: ENDED }
}

'use server'

// The universal Loom image picker's server actions (ADR: one Loom popup for every image upload).
//
// A Loom belongs to the PERSON: everything a user uploads, in any context, is in THEIR Loom
// (library_assets.created_by = them). An image uploaded while editing a SPACE is ALSO attached to that
// Space (space_id), so a teammate editing that Space sees it under the Space's category. So the picker
// has two kinds of scope: the caller's PERSONAL uploads ('mine') and each SPACE they run (by id).
//
// Every read + write RE-RESOLVES + RE-GATES server-side (the client is never trusted): a space scope
// requires the caller to manage that Space (canEditProfile, the same authority uploadToLoom uses);
// 'mine' requires only a signed-in caller. Uploads run through the service-role admin client, so they
// never depend on a live browser Storage session token — the fragile path that returned "new row
// violates row-level security policy". FAIL-SAFE throughout.

import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import {
  listLoomScopeImages,
  listLoomScopeTags,
  insertSpaceLibraryImage,
  type LoomPickAsset,
} from '@/lib/library/store'
import { classifyLoomUpload, fallbackExtFor, fallbackMimeFor } from '@/lib/library/upload-kinds'
import { resolveElement } from '@/lib/elements/store'
import { elementDef } from '@/lib/elements/registry'
import { elementFeatureOn, elementChoice, type ViewerRoleCtx } from '@/lib/elements/config'

/** One selectable Loom scope in the picker's left rail. `key` is 'mine' or a Space id. */
export interface LoomScope {
  key: string
  label: string
  kind: 'mine' | 'space'
}

/** The Loom picker's resolved config for THIS viewer (from the element_settings master, role-gated).
 *  The picker honors it: which tabs render, whether AI Create shows, which scope it opens on. */
export interface LoomPickerConfig {
  tabs: { images: boolean; elements: boolean; tags: boolean; spaces: boolean; airwaves: boolean }
  aiCreate: boolean
  defaultScope: 'mine' | 'space'
}

const DEFAULT_LOOM_CONFIG: LoomPickerConfig = {
  tabs: { images: true, elements: true, tags: true, spaces: true, airwaves: false },
  aiCreate: false,
  defaultScope: 'mine',
}

/** Resolve the Loom element config for the caller (global context: community_role + staff), role-gating
 *  each feature. FAIL-SAFE to the registry defaults. */
async function resolveLoomConfig(
  caller: { community_role?: unknown; webRole?: unknown } | null,
): Promise<LoomPickerConfig> {
  const def = elementDef('loom-picker')
  const resolved = await resolveElement('loom-picker')
  if (!def || !resolved) return DEFAULT_LOOM_CONFIG
  const ctx: ViewerRoleCtx = {
    communityRole: (caller?.community_role as ViewerRoleCtx['communityRole']) ?? null,
    webRole: (caller?.webRole as ViewerRoleCtx['webRole']) ?? null,
  }
  const on = (k: string) => elementFeatureOn(def, resolved, k, ctx)
  return {
    tabs: {
      images: on('tab.images'),
      elements: on('tab.elements'),
      tags: on('tab.tags'),
      spaces: on('tab.spaces'),
      airwaves: on('tab.airwaves'),
    },
    aiCreate: on('aiCreate'),
    defaultScope: elementChoice(resolved, 'defaultScope') === 'space' ? 'space' : 'mine',
  }
}

/** The caller's Loom scopes + resolved config. Scopes: their personal uploads first, then each Space
 *  they run (a per-space category). Config: the role-gated element_settings for the Loom picker.
 *  FAIL-SAFE to just 'mine' + the default config. */
export async function loomScopes(): Promise<{ scopes: LoomScope[]; config: LoomPickerConfig }> {
  const caller = await getCallerProfile()
  if (!caller) return { scopes: [], config: DEFAULT_LOOM_CONFIG }
  let spaces: { id: string; name: string }[] = []
  try {
    spaces = (await listOperatedSpaces(caller.id)).map((s) => ({ id: s.id, name: s.name }))
  } catch {
    spaces = []
  }
  const config = await resolveLoomConfig(caller)
  return {
    scopes: [
      { key: 'mine', label: 'My uploads', kind: 'mine' },
      ...spaces.map((s) => ({ key: s.id, label: s.name, kind: 'space' as const })),
    ],
    config,
  }
}

/** ONE authorized Loom scope + the role-gated config, for a picker locked to a single context (the
 *  Space/profile/page being edited). Unlike loomScopes() this never lists every operated Space: it
 *  authorizes just `scopeKey` (via resolveScope) and returns that one scope's label, or `scope: null`
 *  when the caller cannot read it. FAIL-SAFE — an unauthorized/missing scopeKey yields a null scope +
 *  default config, never a throw. */
export async function loomScope(
  scopeKey: string,
): Promise<{ scope: LoomScope | null; config: LoomPickerConfig }> {
  const caller = await getCallerProfile()
  if (!caller) return { scope: null, config: DEFAULT_LOOM_CONFIG }
  const config = await resolveLoomConfig(caller)
  if (scopeKey === 'mine') {
    return { scope: { key: 'mine', label: 'My uploads', kind: 'mine' }, config }
  }
  const resolved = await resolveScope(caller.id, scopeKey)
  if (!resolved) return { scope: null, config }
  let label = 'This library'
  try {
    const space = await getSpaceById(scopeKey)
    if (space?.name) label = space.name
  } catch {
    // keep the fallback label
  }
  return { scope: { key: scopeKey, label, kind: 'space' }, config }
}

/** Resolve + AUTHORIZE a scope key to a concrete query scope. 'mine' = the caller's personal Loom;
 *  a Space id requires the caller to manage that Space (owner/admin/editor). Null on any miss. */
async function resolveScope(
  callerId: string,
  scopeKey: string,
): Promise<{ createdBy: string } | { spaceId: string } | null> {
  if (scopeKey === 'mine') return { createdBy: callerId }
  // FAIL-SAFE: a transient DB error resolving/authorizing the space must not throw (the picker's
  // contract is "never a throw" → an empty, safe picker), so swallow it to a null (unauthorized) scope.
  try {
    const space = await getSpaceById(scopeKey)
    if (!space) return null
    const caps = await getSpaceCapabilities(space, callerId)
    if (!caps.canEditProfile) return null
    return { spaceId: scopeKey }
  } catch {
    return null
  }
}

/** The images in one scope for the picker grid, plus that scope's tag facets. `view='elements'` keeps
 *  only AI-generated images. Gated + FAIL-SAFE. */
export async function loomImages(
  scopeKey: string,
  opts: { q?: string; tag?: string; view?: 'images' | 'elements' } = {},
): Promise<{ assets: LoomPickAsset[]; tags: string[] }> {
  const caller = await getCallerProfile()
  if (!caller) return { assets: [], tags: [] }
  const scope = await resolveScope(caller.id, scopeKey)
  if (!scope) return { assets: [], tags: [] }
  const [assets, tags] = await Promise.all([
    listLoomScopeImages(scope, { q: opts.q, tag: opts.tag, generatedOnly: opts.view === 'elements' }),
    listLoomScopeTags(scope),
  ])
  return { assets, tags }
}

/** Upload an image into a Loom scope (service-role, so it never hits the browser-session RLS trap) and
 *  return its public URL + id. A space scope attaches the asset to that Space (space_id); a personal
 *  upload attaches to the root library but is stamped created_by the caller, so it always surfaces
 *  under "My uploads". Gated on the scope. */
export async function uploadLoomImage(
  scopeKey: string,
  formData: FormData,
): Promise<{ url: string; id: string } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in to upload.' }
  const scope = await resolveScope(caller.id, scopeKey)
  if (!scope) return { error: 'You cannot add to that library.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file chosen.' }
  const target = classifyLoomUpload(file.type)
  if (!target || target.kind !== 'image') return { error: 'Choose an image file.' }
  if (file.size > target.maxBytes) {
    return { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(target.maxBytes / 1024 / 1024)} MB.` }
  }

  // The owning Space: a space scope attaches to that Space; a personal upload lands in the root library
  // (space_id) but is the caller's own (created_by), so it shows under My uploads in every context.
  const spaceId = 'spaceId' in scope ? scope.spaceId : await loadRootSpaceId()
  if (!spaceId) return { error: 'Could not resolve your library.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || fallbackExtFor(target.kind)).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${spaceId}/${stamp}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, bytes, { contentType: file.type || fallbackMimeFor(target.kind), upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)
  const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 120)
  const slug = `${base}-${stamp}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const id = await insertSpaceLibraryImage({
    spaceId,
    title: base,
    slug,
    storageBucket: target.bucket,
    storagePath: path,
    url: pub.publicUrl,
    mime: file.type || fallbackMimeFor(target.kind),
    bytes: file.size,
    kind: 'image',
    createdBy: caller.id,
  })
  if (!id) {
    await admin.storage.from(target.bucket).remove([path])
    return { error: 'Could not save the image to your Loom. Try again.' }
  }
  return { url: pub.publicUrl, id }
}

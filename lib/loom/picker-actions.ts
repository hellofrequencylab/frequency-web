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
// 'mine' requires only a signed-in caller. The ONE exception is the Studio-only actions at the foot of
// this file (deleteSpaceLoomImage, updateSpaceLoomImageMeta, spaceLoomImageUsage), which decide on the
// Space's `loom` function (canManageSpaceLoom, LIVE-566): the Studio is the management door and the
// picker is the editing door, so switching the Studio off never stops an edit.
// Uploads run through the service-role admin client, so they never depend on a live browser Storage
// session token — the fragile path that returned "new row violates row-level security policy".
// FAIL-SAFE throughout.

import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, getSpaceBySlug, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { canManageSpaceLoom } from '@/lib/library/space-loom-access'
import { normalizeAssetMeta } from '@/lib/library/asset-meta'
import { findLibraryAssetUsage } from '@/lib/library/usage'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import {
  getLibraryAsset,
  updateSpaceLibraryAssetMeta,
  listLoomScopeImages,
  listLoomScopeTags,
  insertSpaceLibraryImage,
  findLibraryAssetBySha256,
  deleteSpaceLibraryAsset,
  type LoomPickAsset,
} from '@/lib/library/store'
import { ingestImageBytes } from '@/lib/library/ingest'
import { loomQuotaFor, loomStorageUsed, loomAdmits, loomMeter, type LoomMeter } from '@/lib/library/quota'
import { readImageDescriptor } from '@/lib/library/image-describe'
import { classifyLoomUpload, effectiveMime, fallbackExtFor, fallbackMimeFor } from '@/lib/library/upload-kinds'
import { resolveElement } from '@/lib/elements/store'
import { elementDef } from '@/lib/elements/registry'
import { elementFeatureOn, elementChoice, type ViewerRoleCtx } from '@/lib/elements/config'

/** One selectable Loom scope in the picker's left rail. `key` is 'mine', or a Space (by id OR slug —
 *  see spaceForScopeKey: the page/block editors only ever carry the slug). */
export interface LoomScope {
  key: string
  label: string
  kind: 'mine' | 'space'
}

/** The Loom picker's resolved config for THIS viewer (from the element_settings master, role-gated).
 *  The picker honors it: which tabs render, whether AI Create shows, which scope it opens on. */
export interface LoomPickerConfig {
  tabs: { images: boolean; icons: boolean; elements: boolean; tags: boolean; spaces: boolean; airwaves: boolean }
  aiCreate: boolean
  defaultScope: 'mine' | 'space'
}

const DEFAULT_LOOM_CONFIG: LoomPickerConfig = {
  tabs: { images: true, icons: true, elements: true, tags: true, spaces: true, airwaves: false },
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
      icons: on('tab.icons'),
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
 *  Space/profile/page being edited; `scopeKey` is 'mine', a Space id, or a Space slug). Unlike
 *  loomScopes() this never lists every operated Space: it
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
    const space = await spaceForScopeKey(scopeKey)
    if (space?.name) label = space.name
  } catch {
    // keep the fallback label
  }
  return { scope: { key: scopeKey, label, kind: 'space' }, config }
}

/** The Space a scope key names: its id, else its SLUG. Both are accepted because the surfaces that lock
 *  the picker to one library carry different handles — the settings forms hold the Space id, while the
 *  page/block editors (the profile builder, the on-canvas editor, the Puck space editor) only ever carry
 *  the slug. Neither is trusted: the key is just a lookup, and every caller re-gates on the resolved
 *  Space below (mirrors lib/page-editor/space-editor-context, where the slug is UX plumbing only). */
async function spaceForScopeKey(scopeKey: string) {
  return (await getSpaceById(scopeKey)) ?? (await getSpaceBySlug(scopeKey))
}

/** Resolve + AUTHORIZE a scope key to a concrete query scope. 'mine' = the caller's personal Loom;
 *  a Space (id or slug) requires the caller to manage that Space (owner/admin/editor). Null on any miss.
 *  The returned `spaceId` is always the resolved Space's REAL id, whichever handle came in. */
async function resolveScope(
  callerId: string,
  scopeKey: string,
): Promise<{ createdBy: string; spaceIds?: string[] } | { spaceId: string } | null> {
  if (scopeKey === 'mine') {
    // A person's Loom is EVERYTHING they own: their own uploads (created_by) UNION every image uploaded to
    // a Space they OWN. So a page/space owner picks from all of it in one place, not just what they
    // personally uploaded. Owned spaces only (via 'owner', not admin'd) — the person who owns the page owns
    // its library. Fail-safe: a bad space read just drops the union back to the personal set.
    let spaceIds: string[] = []
    try {
      spaceIds = (await listOperatedSpaces(callerId)).filter((s) => s.via === 'owner').map((s) => s.id)
    } catch {
      spaceIds = []
    }
    return { createdBy: callerId, spaceIds }
  }
  // FAIL-SAFE: a transient DB error resolving/authorizing the space must not throw (the picker's
  // contract is "never a throw" → an empty, safe picker), so swallow it to a null (unauthorized) scope.
  try {
    const space = await spaceForScopeKey(scopeKey)
    if (!space) return null
    const caps = await getSpaceCapabilities(space, callerId)
    if (!caps.canEditProfile) return null
    return { spaceId: space.id }
  } catch {
    return null
  }
}

/** The images in one scope for the picker grid, plus that scope's tag facets. `view='elements'` keeps
 *  only AI-generated images. Gated + FAIL-SAFE. */
export async function loomImages(
  scopeKey: string,
  opts: { q?: string; tag?: string; kinds?: string[]; generatedOnly?: boolean } = {},
): Promise<{ assets: LoomPickAsset[]; tags: string[] }> {
  const caller = await getCallerProfile()
  if (!caller) return { assets: [], tags: [] }
  const scope = await resolveScope(caller.id, scopeKey)
  if (!scope) return { assets: [], tags: [] }
  // The asset families this view wants (purpose-scoped): the picker passes ['image'] for photos,
  // ['icon'] for the Icons view, ['image','element'] + generatedOnly for Elements, etc.
  const kinds = opts.kinds && opts.kinds.length ? opts.kinds : ['image']
  const [assets, tags] = await Promise.all([
    listLoomScopeImages(scope, { q: opts.q, tag: opts.tag, kinds, generatedOnly: opts.generatedOnly }),
    listLoomScopeTags(scope, kinds),
  ])
  return { assets, tags }
}

/** The Space Loom Studio's storage meter (LIVE-567): what this Space's Loom stores against its cap,
 *  in words. Gated like the Studio's other actions (the caller must manage the Space; the personal
 *  'mine' scope has no meter). A failed read is `read: false`, never a throw, so the meter can never
 *  block the page. Null when the caller cannot manage the Space. */
export async function loomQuotaMeter(spaceKey: string): Promise<LoomMeter | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  const scope = await resolveScope(caller.id, spaceKey)
  if (!scope || !('spaceId' in scope)) return null
  const space = await getSpaceById(scope.spaceId).catch(() => null)
  if (!space) return null
  return loomMeter(loomQuotaFor(space), await loomStorageUsed(scope.spaceId))
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
  // Recover a missing/misreported MIME from the filename (iPhone .heic photos often arrive with a blank
  // File.type), so a real image is classified + uploaded with a correct content-type instead of rejected.
  const mime = effectiveMime(file.type, file.name)
  const target = classifyLoomUpload(mime)
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

  // INGEST (PROG-D1): strip EXIF/XMP/IPTC, checksum the result, read the dimensions — before the
  // bytes reach storage, so what is stored is what was hashed.
  const ingested = ingestImageBytes(new Uint8Array(await file.arrayBuffer()), mime)

  // DEDUPE: the same photo, uploaded twice into the same Loom, is one asset. Answer with the row that
  // is already there rather than storing a second copy of identical bytes. Note this is now
  // METADATA-INSENSITIVE — two exports of one picture that differ only in their EXIF block hash the
  // same, because the hash is taken AFTER the strip.
  const existing = await findLibraryAssetBySha256(spaceId, ingested.sha256)
  if (existing?.url) return { url: existing.url, id: existing.id }

  // BUDGET (LIVE-567, ADR-1585): one bucket serves every Space, so a Space's Loom has a cap. Ask the
  // one gate (loomAdmits, LIVE-629 / ADR-1602: the owning Space's cap and what it already stores)
  // BEFORE storage; refuse past the cap. A failed Space read or a failed sum refuses too: a quota
  // that fails open is not a quota. The root Space (and so a personal upload) is uncapped and skips
  // the sum. A dedupe hit above stores nothing, so it is answered before the budget is asked.
  const verdict = await loomAdmits(spaceId, ingested.bytes.byteLength)
  if (!verdict.ok) return { error: verdict.error }

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, ingested.bytes, { contentType: mime || fallbackMimeFor(target.kind), upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)
  const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 120)
  const slug = `${base}-${stamp}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  // The browser's half of ingest (blurhash + palette + pre-downscale dimensions), validated here
  // because it arrived from a client. Absent on any uploader that has not adopted it yet.
  const described = readImageDescriptor(formData)

  const id = await insertSpaceLibraryImage({
    spaceId,
    title: base,
    slug,
    storageBucket: target.bucket,
    storagePath: path,
    url: pub.publicUrl,
    mime: mime || fallbackMimeFor(target.kind),
    bytes: ingested.bytes.byteLength,
    kind: 'image',
    createdBy: caller.id,
    source: 'upload',
    sha256: ingested.sha256,
    width: ingested.width,
    height: ingested.height,
    blurhash: described.blurhash,
    colors: described.colors,
    origWidth: described.origWidth ?? ingested.width,
    origHeight: described.origHeight ?? ingested.height,
  })
  if (!id) {
    await admin.storage.from(target.bucket).remove([path])
    return { error: 'Could not save the image to your Loom. Try again.' }
  }
  return { url: pub.publicUrl, id }
}

/** The Space a Studio-only action names (`spaceKey`, id or slug) and the caller's role on it, for the
 *  action to put through canManageSpaceLoom (LIVE-566, ADR-1578) at its own door. The personal 'mine'
 *  scope is not a Space, so it never resolves here. FAIL-SAFE: any error reads as no Space. */
async function loomSpaceAndRole(callerId: string, spaceKey: string) {
  try {
    const space = spaceKey === 'mine' ? null : await spaceForScopeKey(spaceKey)
    if (!space) return null
    const caps = await getSpaceCapabilities(space, callerId)
    return { space, role: caps.role }
  } catch {
    return null
  }
}

/** Is `assetId` one of this Space's own Loom rows? A read bound to space_id; a failed read is NO.
 *  Asked before a usage read, so a Space never learns where another Space's image is placed. */
async function spaceHoldsAsset(spaceId: string, assetId: string): Promise<boolean> {
  try {
    return !!(await getLibraryAsset(spaceId, assetId))
  } catch {
    return false
  }
}

/** The refusal a Space delete returns while the image is still placed (LIVE-568). The admin door's
 *  sentence, less its "Archive it instead": the Space Studio has no archive. */
function placedRefusal(pages: number): string {
  return `This image is on ${pages} page${pages === 1 ? '' : 's'}. Take it off ${pages === 1 ? 'that page' : 'those pages'} first, then remove it here.`
}

/** Delete an image from a SPACE's Loom (the Loom Studio's remove control). Gated on the Space's `loom`
 *  FUNCTION through canManageSpaceLoom (LIVE-566, ADR-1578): the switch and the min-role bar the Space set,
 *  NOT the picker's `canEditProfile` scope, because this is the Studio's management door and the picker is
 *  the editing door (ADR-1559 §4). Only a Space (by id or slug) is deletable here: the personal 'mine' scope
 *  is not a Space, so it is rejected (a person's cross-space uploads are managed where they live).
 *
 *  SAFE DELETE (LIVE-568, ADR-1586): the admin door's guard (PROG-D4, ADR-1502). The usage index is read
 *  first; an image still placed on a page is refused with the count, and a FAILED read refuses too
 *  (deleting what you could not prove unused is the destructive half of ADR-979). Best-effort removes the
 *  stored object after the row. FAIL-SAFE: any error resolving the Space reads as no access. */
export async function deleteSpaceLoomImage(
  spaceKey: string,
  assetId: string,
): Promise<{ ok: true } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in to manage this library.' }
  if (!assetId) return { error: 'Nothing to remove.' }
  const ctx = await loomSpaceAndRole(caller.id, spaceKey)
  if (!ctx || !canManageSpaceLoom(ctx.space, ctx.role)) return { error: 'You cannot manage that library.' }
  const spaceId = ctx.space.id
  if (!(await spaceHoldsAsset(spaceId, assetId))) return { error: 'That image is not in this library.' }
  const usage = await findLibraryAssetUsage(assetId)
  if (!usage.ok) return { error: 'Could not check where this image is used, so it stays. Try again.' }
  if (usage.pages > 0) return { error: placedRefusal(usage.pages) }
  const removed = await deleteSpaceLibraryAsset(spaceId, assetId)
  if (!removed) return { error: 'That image could not be removed. Try again.' }
  if (removed.bucket && removed.path) {
    try {
      await createAdminClient().storage.from(removed.bucket).remove([removed.path])
    } catch {
      /* best-effort: the row is already gone, a lingering object is harmless */
    }
  }
  return { ok: true }
}

/** Rename, caption or retag ONE image in a Space's Loom (LIVE-568, ADR-1586): the Space Studio's
 *  editor. Same door as the delete (canManageSpaceLoom), same validation as the Loom Studio drawer
 *  (normalizeAssetMeta), and a write bound to space_id, so an id from another Space updates nothing.
 *  Returns the saved words so the Studio shows what the row now holds. */
export async function updateSpaceLoomImageMeta(
  spaceKey: string,
  assetId: string,
  fields: { title?: string; alt?: string; tags?: string },
): Promise<{ ok: true; title: string | null; alt: string | null; tags: string[] | null } | { error: string }> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in to manage this library.' }
  if (!assetId) return { error: 'Nothing to edit.' }
  const ctx = await loomSpaceAndRole(caller.id, spaceKey)
  if (!ctx || !canManageSpaceLoom(ctx.space, ctx.role)) return { error: 'You cannot manage that library.' }
  const spaceId = ctx.space.id
  const words = normalizeAssetMeta({ title: fields?.title, alt: fields?.alt, tags: fields?.tags })
  if ('error' in words) return { error: words.error }
  const out = await updateSpaceLibraryAssetMeta(spaceId, assetId, words.patch)
  if (out === 'missing') return { error: 'That image is not in this library.' }
  if (out === 'failed') return { error: 'That did not save. Try again.' }
  return {
    ok: true,
    title: words.patch.title ?? null,
    alt: words.patch.alt ?? null,
    tags: words.patch.tags ?? null,
  }
}

/** How many pages place ONE image of a Space's Loom (LIVE-568): the count the Studio shows next to
 *  Remove, so a refused delete is never the first a person hears of it. Same door as the delete, and
 *  only for this Space's own rows. Counts only: the places themselves can sit in other Spaces. A
 *  failed read is `ok: false`, which the Studio says as "could not check", never as zero. */
export async function spaceLoomImageUsage(
  spaceKey: string,
  assetId: string,
): Promise<{ ok: true; pages: number } | { ok: false }> {
  const caller = await getCallerProfile()
  if (!caller || !assetId) return { ok: false }
  const ctx = await loomSpaceAndRole(caller.id, spaceKey)
  if (!ctx || !canManageSpaceLoom(ctx.space, ctx.role)) return { ok: false }
  if (!(await spaceHoldsAsset(ctx.space.id, assetId))) return { ok: false }
  const usage = await findLibraryAssetUsage(assetId)
  return usage.ok ? { ok: true, pages: usage.pages } : { ok: false }
}

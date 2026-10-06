import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeAction } from '@/lib/admin/guard'
import type { getCallerProfile } from '@/lib/auth'
import { signedLibraryAssetUrl } from './asset-urls'
import { extForMime } from './export-svg'
import { LIBRARY_DOWNLOAD_POLICIES, isLibraryAssetExpired, type LibraryDownloadPolicy } from './types'

// THE LOOM DOWNLOAD DOOR (LIVE-578, ADR-1596; child 3 of PROG-D6 under ADR-1562).
//
// Every download of a file-backed Loom asset goes through app/api/library/download/[id]/route.ts,
// and that route is this module. In order: read the row; refuse a missing file or an expired
// license; apply the asset's download policy to the caller (open: anyone who reached the link;
// members: a signed-in profile; staff: the Loom Studio gate; a PROTECTED asset left on the default
// `open` reads as staff, SCAN-652); mint where the file is (a ONE-MINUTE
// signed URL for a protected original, the public url for everything else, both served as an
// attachment); write ONE row to public.library_downloads; and only then answer with the redirect.
//
// Two invariants, both tested (download-door.test.ts):
//   1. A download that cannot be recorded is refused. The record is what the policy exists for, so
//      a failed insert answers 503 and the signed URL minted a moment earlier is never sent (it dies
//      unused within the minute).
//   2. The door never signs for longer than LIBRARY_DOWNLOAD_TTL_SECONDS.
//
// Code-drawn elements have no file and never come here: the drawer's SVG and PNG exports render them
// in the browser (lib/library/export-svg.ts), which has nothing to hand out.

/** How long the door's signed URL lives. The redirect follows it at once, so a minute is plenty and
 *  a link copied out of the address bar is dead before it can be passed around. */
export const LIBRARY_DOWNLOAD_TTL_SECONDS = 60

/** The caller as the route establishes it (lib/auth.ts getCallerProfile): null when signed out. */
export type DownloadCaller = Awaited<ReturnType<typeof getCallerProfile>>

/** The row fields the door reads. */
export type DownloadableAsset = {
  id: string
  kind: string
  slug: string
  url: string | null
  mime: string | null
  storagePath: string | null
  isProtected: boolean
  downloadPolicy: LibraryDownloadPolicy
  expiresAt: string | null
}

/** Why a download was refused, as the person reads it (docs/CONTENT-VOICE.md), with its status. */
export const DOWNLOAD_REFUSAL = {
  missing: { status: 404, message: 'We could not find that file in the Loom.' },
  expired: { status: 410, message: 'The license on this file has run out, so it cannot be downloaded any more.' },
  members: { status: 401, message: 'This file is for members. Sign in and try the link again.' },
  staff: { status: 403, message: 'Only the Loom team can download this original.' },
  unavailable: { status: 503, message: 'This file is not ready to download right now. Try again in a minute.' },
  unrecorded: {
    status: 503,
    message: 'We could not write this download down, so we did not start it. Try again in a minute.',
  },
} as const

export type DownloadRefusal = keyof typeof DOWNLOAD_REFUSAL

export type DownloadOutcome = { ok: true; location: string } | { ok: false; refusal: DownloadRefusal }

/** The stored policy narrowed to the closed set. Anything unknown reads as `staff`: at the door, the
 *  safe misreading is the strictest one (the Studio reads the same column as `open`, the default). */
export function readDoorPolicy(v: unknown): LibraryDownloadPolicy {
  return (LIBRARY_DOWNLOAD_POLICIES as readonly string[]).includes(String(v)) ? (v as LibraryDownloadPolicy) : 'staff'
}

/**
 * PURE. The policy the door applies. `open` is the column DEFAULT (20260920000000_library_dam.sql),
 * not a choice, so a PROTECTED asset still sitting on it reads as `staff` at the door: a protected
 * image is never its original (LIVE-580), and the picker hands the asset id to every picker user,
 * so an open door on a protected master was one GET away from anyone, signed out included (SCAN-652,
 * ruling b). An operator who PICKED `members` or `staff` on a protected asset keeps that pick; the
 * two knobs stay independent (ADR-1594) except for the default nobody chose.
 */
export function effectiveDownloadPolicy(
  asset: Pick<DownloadableAsset, 'isProtected' | 'downloadPolicy'>,
): LibraryDownloadPolicy {
  return asset.isProtected && asset.downloadPolicy === 'open' ? 'staff' : asset.downloadPolicy
}

/**
 * PURE. Does the policy admit this caller? `isStudioStaff` is asked only for a `staff` asset, so an
 * open download never costs a staff lookup.
 */
export async function admitDownload(
  policy: LibraryDownloadPolicy,
  caller: DownloadCaller,
  isStudioStaff: (caller: NonNullable<DownloadCaller>) => Promise<boolean>,
): Promise<DownloadRefusal | null> {
  if (policy === 'open') return null
  if (!caller) return 'members'
  if (policy === 'members') return null
  return (await isStudioStaff(caller)) ? null : 'staff'
}

/** PURE. The attachment name: the slug and the extension the mime says, nothing a header can trip on. */
export function downloadFilename(asset: Pick<DownloadableAsset, 'slug' | 'mime'>): string {
  const base = asset.slug.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'loom-file'
  return `${base}.${extForMime(asset.mime).replace(/[^A-Za-z0-9]+/g, '') || 'bin'}`
}

/** PURE. A public Supabase storage url served as an attachment (storage's `download` query flag);
 *  any other url is returned unchanged, because only storage honours the flag. */
export function publicDownloadUrl(url: string, filename: string): string {
  if (!url.includes('/storage/v1/object/public/')) return url
  try {
    const u = new URL(url)
    u.searchParams.set('download', filename)
    return u.toString()
  } catch {
    return url
  }
}

/** The Loom Studio gate, answered instead of redirected: the same `('janitor', { staff: 'marketing' })`
 *  requireAdmin applies to app/(main)/admin/library/page.tsx and every action beside it. */
export async function isLoomStudioStaff(caller: NonNullable<DownloadCaller>): Promise<boolean> {
  return authorizeAction(caller, 'janitor', 'marketing').then(
    () => true,
    () => false,
  )
}

const ASSET_COLUMNS = 'id, kind, slug, url, mime, storage_path, is_protected, download_policy, expires_at'

async function readDownloadableAsset(id: string): Promise<DownloadableAsset | null> {
  const { data, error } = await createAdminClient()
    .from('library_assets')
    .select(ASSET_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    kind: data.kind,
    slug: data.slug ?? '',
    url: data.url ?? null,
    mime: data.mime ?? null,
    storagePath: data.storage_path ?? null,
    isProtected: data.is_protected === true,
    downloadPolicy: readDoorPolicy(data.download_policy),
    expiresAt: data.expires_at ?? null,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * THE DOOR. Applies the policy to `caller`, records the download, and answers where to send them.
 * The caller is established by the route BEFORE this runs (it is the route's gate); nothing here
 * hands out a file without the policy's say-so and a written row.
 */
export async function openLibraryDownload(
  id: string,
  caller: DownloadCaller,
  deps: { isStudioStaff?: (caller: NonNullable<DownloadCaller>) => Promise<boolean>; now?: Date } = {},
): Promise<DownloadOutcome> {
  if (!UUID.test(id)) return { ok: false, refusal: 'missing' }
  const asset = await readDownloadableAsset(id)
  if (!asset || (!asset.url && !asset.storagePath)) return { ok: false, refusal: 'missing' }
  if (isLibraryAssetExpired(asset.expiresAt, deps.now)) return { ok: false, refusal: 'expired' }

  const policy = effectiveDownloadPolicy({ isProtected: asset.isProtected, downloadPolicy: asset.downloadPolicy })
  const refusal = await admitDownload(policy, caller, deps.isStudioStaff ?? isLoomStudioStaff)
  if (refusal) return { ok: false, refusal }

  const filename = downloadFilename(asset)
  const location = asset.url
    ? publicDownloadUrl(asset.url, filename)
    : await signedLibraryAssetUrl(asset, LIBRARY_DOWNLOAD_TTL_SECONDS, { download: filename })
  if (!location) return { ok: false, refusal: 'unavailable' }

  // The record comes BEFORE the redirect, and a failed write refuses the download (invariant 1).
  const { error } = await createAdminClient()
    .from('library_downloads')
    .insert({ asset_id: asset.id, profile_id: caller?.id ?? null, policy })
  if (error) return { ok: false, refusal: 'unrecorded' }

  return { ok: true, location }
}

/** What the drawer shows under [data-loom-downloads]: how many times the file left, and when last.
 *  Staff only: the caller (a Studio action) gates first. Null when the record cannot be read. */
export async function readLibraryDownloadRecord(
  assetId: string,
): Promise<{ count: number; lastAt: string | null } | null> {
  if (!UUID.test(assetId)) return null
  const { data, count, error } = await createAdminClient()
    .from('library_downloads')
    .select('created_at', { count: 'exact' })
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return null
  return { count: count ?? 0, lastAt: data?.[0]?.created_at ?? null }
}

'use server'

// SPACE CHECK-IN TAG actions for the CyberUnicorn console (LIVE-1182, docs/LOYALTY.md "Check-in tags").
// Staff only: every call runs behind consoleStaffGate (lib/devices/store.ts) or ensureCheckinNodeForStaff.
// The flow: startSpaceTag returns the Space's signed door link, the console writes it with
// `frequency.write_tag`, then finishSpaceTag records the chip it read back.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { ensureCheckinNodeForStaff } from '@/lib/spaces/checkin'
import { signedPlacardUrl } from '@/lib/qr/node-code'
import { shortLinkUrl, withMedium } from '@/lib/qr/links'
import { generateSlug } from '@/lib/qr/codes'
import { createAdminClient } from '@/lib/supabase/admin'
import { applySearchTerms } from '@/lib/search/query'
import { normalizeUid } from './credentials'
import { consoleStaffGate } from './store'
import { latestCheckinSince, listSpaceTags, recordSpaceTag, removeSpaceTag, type SpaceTagRow } from './space-tags'
import { searchTagTargets, tagPathFromLink } from './tag-targets'
import type { TagTarget } from './tag-target-kinds'

const LABEL_MAX = 60

/** The link to write: the Space's signed door check-in link (the node is made if the Space has none). */
export async function startSpaceTag(spaceId: unknown): Promise<ActionResult<{ nodeId: string; url: string }>> {
  if (typeof spaceId !== 'string' || !spaceId) return fail('Choose a Space first.')
  const node = await ensureCheckinNodeForStaff(spaceId)
  if (!node) return fail('Could not get that Space’s check-in link. Only Frequency staff can write Space tags.')
  try {
    // The placard link carries `m=nfc`, so Scan stats count placard taps apart from QR scans.
    return ok({ nodeId: node.id, url: signedPlacardUrl(node.id) })
  } catch {
    return fail('Could not sign that Space’s check-in link. Try again.')
  }
}

/** The tag is written: put it on the Space's list. */
export async function finishSpaceTag(
  spaceId: unknown,
  nodeId: unknown,
  rawUid: unknown,
  rawType: unknown,
  rawLabel: unknown,
): Promise<ActionResult> {
  if (typeof spaceId !== 'string' || typeof nodeId !== 'string') return fail('The tag was written but could not be listed.')
  const label = (typeof rawLabel === 'string' ? rawLabel.trim() : '').slice(0, LABEL_MAX)
  const chipType = typeof rawType === 'string' && rawType.trim() ? rawType.trim().slice(0, 40) : null
  const saved = await recordSpaceTag({ spaceId, nodeId, uid: normalizeUid(rawUid), chipType, label })
  return saved ? ok() : fail('The tag works, but it could not be added to the list.')
}

/** The Space's tags, for the console after a Space is chosen. */
export async function readSpaceTags(spaceId: unknown): Promise<ActionResult<SpaceTagRow[]>> {
  if (typeof spaceId !== 'string' || !spaceId) return ok([])
  return ok(await listSpaceTags(spaceId))
}

/** Take a tag off the list. */
export async function dropSpaceTag(tagId: unknown): Promise<ActionResult> {
  if (typeof tagId !== 'string' || !(await removeSpaceTag(tagId))) return fail('Could not remove that tag.')
  return ok()
}

/** Has anyone checked in on this Space's door link since the placard was written? Polled by the
 *  console's "tap it with your phone" step. */
export async function checkPlacardTap(nodeId: unknown, sinceIso: unknown): Promise<ActionResult<{ name: string; at: string; count: number } | null>> {
  if (typeof nodeId !== 'string' || typeof sinceIso !== 'string' || !Number.isFinite(Date.parse(sinceIso))) return ok(null)
  return ok(await latestCheckinSince(nodeId, new Date(Date.parse(sinceIso)).toISOString()))
}

// ── ANY-PAGE TAGS ───────────────────────────────────────────────────────────────────────────────────
// A tag that opens a page instead of a Space's door check-in. It is written as a managed /q/<slug>
// code filed under the page's QR folder (lib/devices/tag-targets.ts), so taps land in the page's
// Scan activity as `medium = nfc`. One tag code per page: every sticker for that page shares it, and
// retargeting it in the QR Studio moves them all.

/** The source tag that marks a console-made tag code, so the next sticker for the page reuses it. */
const TAG_SOURCE = 'nfc-tag'
const UNIQUE_VIOLATION = '23505'

/** Pages a tag can open, for the console's search box. */
export async function findTagTargets(query: unknown): Promise<ActionResult<TagTarget[]>> {
  if (!(await consoleStaffGate())) return fail('Only Frequency staff can program tags.')
  if (typeof query !== 'string') return ok([])
  return ok(await searchTagTargets(query.slice(0, 120)))
}

/** The link to write for a page tag: the page's tag code, made the first time a page gets a tag. */
export async function startPageTag(rawPath: unknown, rawTitle: unknown): Promise<ActionResult<{ codeId: string; path: string; url: string }>> {
  const gate = await consoleStaffGate()
  if (!gate) return fail('Only Frequency staff can program tags.')
  const path = typeof rawPath === 'string' ? tagPathFromLink(rawPath) : null
  if (!path) return fail('That is not a Frequency page a tag can open. Paste a link from frequencylocal.com or search for the page.')
  const title = `NFC tag: ${(typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : path).slice(0, LABEL_MAX)}`
  const db = createAdminClient()
  try {
    const { data: existing } = await db
      .from('qr_codes')
      .select('id, slug')
      .eq('page_path', path)
      .eq('source_tag', TAG_SOURCE)
      .eq('destination_type', 'url')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existing) return ok({ codeId: existing.id, path, url: withMedium(shortLinkUrl(existing.slug), 'nfc') })
    for (let attempt = 0; attempt < 6; attempt++) {
      // Seven characters: the length CyberUnicorn OS checks a /q/ link against before it writes.
      const slug = generateSlug(7)
      const { data, error } = await db
        .from('qr_codes')
        .insert({ slug, title, destination_type: 'url', target_url: path, page_path: path, source_tag: TAG_SOURCE, created_by: gate.callerId })
        .select('id, slug')
        .single()
      if (data) return ok({ codeId: data.id, path, url: withMedium(shortLinkUrl(data.slug), 'nfc') })
      if (error?.code !== UNIQUE_VIOLATION) break
    }
  } catch {
    // Fall through to the one message below.
  }
  return fail('Could not make the link for that page. Try again.')
}

/** Has a phone tapped this page tag since it was written? Polled by the console's verify step. */
export async function checkTagScan(codeId: unknown, sinceIso: unknown): Promise<ActionResult<{ at: string; count: number } | null>> {
  if (!(await consoleStaffGate())) return ok(null)
  if (typeof codeId !== 'string' || typeof sinceIso !== 'string' || !Number.isFinite(Date.parse(sinceIso))) return ok(null)
  try {
    const { data, count } = await createAdminClient()
      .from('qr_scans')
      .select('scanned_at', { count: 'exact' })
      .eq('qr_code_id', codeId)
      .eq('medium', 'nfc')
      .gte('scanned_at', new Date(Date.parse(sinceIso)).toISOString())
      .order('scanned_at', { ascending: false })
      .limit(1)
    const row = data?.[0]
    return ok(row ? { at: row.scanned_at, count: count ?? 1 } : null)
  } catch {
    return ok(null)
  }
}

/** Members by name or handle, for the console's badge box. Staff only: a badge is written for a
 *  member who asked at a Space, so this finds any active member, the way the admin member list does. */
export async function findConsoleMembers(query: unknown): Promise<ActionResult<{ name: string; handle: string }[]>> {
  if (!(await consoleStaffGate())) return fail('Only Frequency staff can program badges.')
  const q = typeof query === 'string' ? query.replace(/^@/, '').trim().slice(0, 60) : ''
  if (q.length < 2) return ok([])
  try {
    const { data } = await applySearchTerms(
      createAdminClient().from('profiles').select('display_name, handle'),
      ['display_name', 'handle'],
      q,
    )
      .eq('is_active', true)
      .not('handle', 'is', null)
      .order('display_name')
      .limit(8)
    return ok((data ?? []).filter((p) => p.handle).map((p) => ({ name: p.display_name?.trim() || `@${p.handle}`, handle: p.handle! })))
  } catch {
    return ok([])
  }
}

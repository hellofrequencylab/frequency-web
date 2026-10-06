import 'server-only'

import { listLibraryAssetBytesPage } from '@/lib/library/store'
import { getSpaceById } from '@/lib/spaces/store'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPACE LOOM BUDGET (LIVE-567, ADR-1585).
//
// One `library-media` bucket serves every Space, and until this module nothing summed what a
// Space stores or refused the next upload: a single Space could upload until the project ran
// out. This is the budget, in three parts:
//
//   · loomQuotaFor(space)       PURE. The cap: a constant per plan tier (asSpacePlan). The root
//                               Space (Frequency's own library, and where personal uploads land)
//                               has no cap. A larger-library entitlement key is deferred to the
//                               owner (ADR-1585): what it costs and what it holds is a pricing call.
//   · loomStorageUsed(spaceId)  The sum of `library_assets.bytes` over the Space's FILE-BACKED rows
//                               (storage_path set), read a page at a time through lib/library/store
//                               (the service-role seam, callers gate). A NULL `bytes` (the
//                               importer and the event-photo copy never held the bytes) is UNKNOWN,
//                               counted and reported, never weighed as zero.
//   · loomBudgetVerdict(...)    PURE. Used + incoming against the cap. 🔴 A FAILED SUM REFUSES THE
//                               UPLOAD: a quota that fails open is not a quota (ADR-979 with the
//                               roles reversed). The meter is the other way round: a failed read
//                               shows words, it never blocks the page.
//
// The numbers live in LOOM_STORAGE_CAP_BYTES; changing a cap is one line here. No migration: the bytes column is already written on every ingested upload.
//
//   · loomAdmits(spaceId, n)    THE ONE GATE every Space-scoped write that stores new bytes calls
//                               before storage (LIVE-629, ADR-1602): it reads the owning Space,
//                               then the cap, the sum and the verdict above. A write door never
//                               re-assembles those three itself. Today: uploadLoomImage (the
//                               picker), uploadToLoom (the page editor's field) and
//                               generateEntityCoverAction (the AI cover).
//
// READS ONLY. `loomStorageUsed` reads `bytes` for a caller-supplied Space id and writes nothing;
// every caller authorizes the Space first (uploadLoomImage and
// loomQuotaMeter via resolveScope, uploadToLoom via authorizeSpaceEditor, the AI cover via
// resolveWriteScope, the Space Loom Studio page via canManageSpaceLoom).
// ─────────────────────────────────────────────────────────────────────────────

const MB = 1024 * 1024
const GB = 1024 * MB

/** The Loom storage cap per Space plan tier, in bytes. Owner-tunable: one line per tier. */
export const LOOM_STORAGE_CAP_BYTES: Record<SpacePlan, number> = {
  free: 1 * GB,
  business: 10 * GB,
  nonprofit: 10 * GB,
  independent: 10 * GB,
  // Collective rungs (ADR-1709): five member Spaces share one account, so the account holds more.
  collective: 50 * GB,
  nonprofit_collective: 50 * GB,
}

/** The rows one page of the sum reads, and the most pages it will read before it calls the sum
 *  failed. 200 x 1000 rows is far past any Space today; hitting it is a refusal, not a guess. */
const SUM_PAGE = 1000
const SUM_MAX_PAGES = 200

/** A Space's Loom cap. `capped: false` only for the root Space. */
type LoomQuota = { capped: false } | { capped: true; capBytes: number }

/** What loomQuotaFor needs from a Space: its type (root is uncapped) and its plan label. The
 *  `Space` from lib/spaces/store fits. */
interface LoomQuotaSpace {
  type?: string | null
  plan?: string | null
}

/** The Loom cap for a Space. PURE. The root Space has none; every other Space gets its tier's cap.
 *  A missing Space or an unknown plan reads as free (default-deny). */
export function loomQuotaFor(space: LoomQuotaSpace | null | undefined): LoomQuota {
  if (space?.type === 'root') return { capped: false }
  return { capped: true, capBytes: LOOM_STORAGE_CAP_BYTES[asSpacePlan(space?.plan)] }
}

/** What a Space stores: the counted bytes, how many file-backed rows were counted, and how many
 *  carry no size (`unknown`). `ok: false` means the sum could not be read, which callers treat as
 *  "cannot prove there is room", never as zero. */
type LoomUsage = { ok: true; bytes: number; files: number; unknown: number } | { ok: false }

/** Fold a list of `bytes` values into counted bytes + an unknown count. PURE. A non-number, a
 *  negative or a non-finite value is UNKNOWN, not zero. */
export function sumLoomBytes(
  rows: readonly { bytes?: number | null }[],
): { bytes: number; files: number; unknown: number } {
  let bytes = 0
  let files = 0
  let unknown = 0
  for (const row of rows) {
    const b = row?.bytes
    if (typeof b === 'number' && Number.isFinite(b) && b >= 0) {
      bytes += b
      files += 1
    } else {
      unknown += 1
    }
  }
  return { bytes, files, unknown }
}

/** Sum what one Space's Loom stores (file-backed rows only: a code-drawn element or an external
 *  URL has no object in the bucket). Pages through the rows by id. Never throws: a failed page, or
 *  more pages than SUM_MAX_PAGES, returns `{ ok: false }`. */
export async function loomStorageUsed(spaceId: string): Promise<LoomUsage> {
  if (!spaceId) return { ok: false }
  try {
    const rows: { bytes: number | null }[] = []
    for (let page = 0; page < SUM_MAX_PAGES; page++) {
      const from = page * SUM_PAGE
      const data = await listLibraryAssetBytesPage(spaceId, from, from + SUM_PAGE - 1)
      if (!data) return { ok: false }
      rows.push(...data)
      if (data.length < SUM_PAGE) return { ok: true, ...sumLoomBytes(rows) }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

/** Bytes as a person reads them: "340 KB", "12.4 MB", "1.2 GB". PURE. */
export function formatLoomBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB'
  // Switch units at 1000 of the smaller one, so 1023.9 MB reads "1 GB", never "1024 MB".
  if (n >= 1000 * MB) return `${trim(n / GB)} GB`
  if (n >= 1000 * 1024) return `${trim(n / MB)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function trim(v: number): string {
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '')
}

type LoomBudgetVerdict = { ok: true } | { ok: false; error: string }

/** The refusal when the budget cannot be read (a failed Space read or a failed sum). */
const LOOM_BUDGET_UNREAD =
  'Could not check how much room this library has left, so the upload is paused. Try again in a moment.'

/** May `incomingBytes` more land in this Loom? PURE. Uncapped: yes. A failed sum: no (deny on the
 *  unknown). Used + incoming past the cap: no, naming what is used and what the cap is. Exactly at
 *  the cap is allowed. The words are the refusal the upload action returns. */
export function loomBudgetVerdict(quota: LoomQuota, usage: LoomUsage, incomingBytes: number): LoomBudgetVerdict {
  if (!quota.capped) return { ok: true }
  if (!usage.ok) return { ok: false, error: LOOM_BUDGET_UNREAD }
  const incoming = Number.isFinite(incomingBytes) && incomingBytes > 0 ? incomingBytes : 0
  if (usage.bytes + incoming <= quota.capBytes) return { ok: true }
  return {
    ok: false,
    error: `This library is full: ${formatLoomBytes(usage.bytes)} of ${formatLoomBytes(quota.capBytes)} used. Remove images you no longer need to make room.`,
  }
}

/** May `incomingBytes` more land in this Space's Loom? The one gate a Space-scoped write calls
 *  BEFORE it stores anything (LIVE-629, ADR-1602). Reads the owning Space, then asks
 *  loomQuotaFor + loomStorageUsed + loomBudgetVerdict. Never throws. FAILS CLOSED: a missing id, a
 *  Space that cannot be read, or a failed sum refuses. The root Space is uncapped and skips the sum.
 *  The caller returns `error` as its own returned refusal, never a throw. */
export async function loomAdmits(spaceId: string, incomingBytes: number): Promise<LoomBudgetVerdict> {
  if (!spaceId) return { ok: false, error: LOOM_BUDGET_UNREAD }
  const space = await getSpaceById(spaceId).catch(() => null)
  if (!space) return { ok: false, error: LOOM_BUDGET_UNREAD }
  const quota = loomQuotaFor(space)
  if (!quota.capped) return { ok: true }
  return loomBudgetVerdict(quota, await loomStorageUsed(spaceId), incomingBytes)
}

/** The Space Loom Studio's meter, already in words so the client imports nothing from here.
 *  `read: false` = the sum failed; the Studio says so and keeps working. */
export interface LoomMeter {
  read: boolean
  used: string | null
  cap: string | null
  /** 0 to 100, or null when uncapped or unread. */
  percent: number | null
  unknown: number
}

/** Build the meter from a quota and a usage reading. PURE. */
export function loomMeter(quota: LoomQuota, usage: LoomUsage): LoomMeter {
  const cap = quota.capped ? formatLoomBytes(quota.capBytes) : null
  if (!usage.ok) return { read: false, used: null, cap, percent: null, unknown: 0 }
  const percent = quota.capped
    ? Math.min(100, Math.round((usage.bytes / Math.max(1, quota.capBytes)) * 100))
    : null
  return { read: true, used: formatLoomBytes(usage.bytes), cap, percent, unknown: usage.unknown }
}

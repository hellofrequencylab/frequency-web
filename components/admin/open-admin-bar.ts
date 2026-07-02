// The typed entry seam for the standardized admin bar (docs/ADMIN-RAIL.md Phase 1). Replaces the bare
// `open-settings` window Event with a CustomEvent that can carry a pre-resolved scope + caps (plus a
// slot / appId for later deep-linking), so ANY affordance — an entity header "Edit" button, a future
// Loom App tile — can open the bar pointed at one scope's Apps, gated on the viewer's REAL caps.
//
// The desktop drawer + the mobile sheet listen for OPEN_ADMIN_BAR and OPEN (they never toggle), while
// the legacy `open-settings` listener is kept during migration for the old toggle path. An EMPTY
// detail behaves identically (in content) to the old bare `open-settings`. Pure metadata + one
// client-only dispatch helper; the type imports are erased at build, so this stays client-safe.

import type { AdminScope } from '@/lib/layout/page-chrome'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import type { Capability } from '@/lib/core/capabilities'

/** The typed window event the standardized admin bar opens on. */
export const OPEN_ADMIN_BAR = 'open-admin-bar'

/** What an OPEN_ADMIN_BAR dispatch may carry. Every field is optional: an empty detail is the plain
 *  "open the bar" trigger, whose resolved CONTENT matches the old bare `open-settings`. */
export interface OpenAdminBarDetail {
  /** The page/entity scope to point the bar at. `id` is the entity's DB id (NOT the URL slug — this is
   *  what lets the panel gate on real caps without the slug≠id trap). Absent ⇒ resolve from the path. */
  scope?: AdminScope
  /** The viewer's capabilities already resolved for `scope` by the page that dispatched. The panel
   *  gates its module selection on these instead of the caps-blind fallback. */
  caps?: Capability[]
  /** A 9-spine category to land in directly (drill-down, Phase 3). */
  slot?: AdminSlot
  /** A single App to open (deep-link, Phase 3). */
  appId?: string
}

/** Open the standardized admin bar, optionally pre-scoped. Client-only (uses `window`). */
export function openAdminBar(detail?: OpenAdminBarDetail): void {
  window.dispatchEvent(new CustomEvent<OpenAdminBarDetail>(OPEN_ADMIN_BAR, { detail: detail ?? {} }))
}

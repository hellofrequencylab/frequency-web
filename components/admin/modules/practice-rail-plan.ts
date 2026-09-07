// ─────────────────────────────────────────────────────────────────────────────
// THE PRACTICE RAIL'S PLAN (ADR-450 §2 · ADR-1240 · HYG-050).
//
// The Practice settings module used to declare its fields by hand: seven labelled controls, each
// with its own label, kind, and order, beside a manifest that declared the same seven fields with
// different labels and, for three of them, a different plane. Nothing compared the two. Now the
// module renders THIS, and this is the manifest filtered through the kernel's edit plan.
//
// What this file says for itself is only the SAVE PATHS: which columns each of the rail's three
// actions persists. The rail has three because the three saves are genuinely different (a cover
// self-saves through the Loom, the settings form autosaves as a whole, a rename rewrites the page
// URL), and each is bound to the plan for exactly the columns it writes. Everything a field IS,
// its label, its kind, its options, whether it is required, and where it falls in the order, is
// PRACTICE_MANIFEST's, read through `railForm()`.
//
// HOSTING THE INLINE PLANE. The manifest places `title`, `summary`, and `description` on the inline
// canvas, and that is right: they are the content of the page. No inline canvas exists on
// /practices/[id] yet, so the rail hosts them (`hostInline`). When the canvas lands, dropping that
// flag moves the three fields off the rail with no other change, which is the seam working.
//
// PURE: the manifest and the kernel only. The module and its test both import this, so the test
// pins what the rail renders without mounting a client module that reaches server actions.
// ─────────────────────────────────────────────────────────────────────────────

import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { railForm, type RailForm } from '@/lib/studio/kernel/edit-plan'

/** The columns `setPracticeCoverUrl` / `removePracticeCover` write. */
export const PRACTICE_COVER_WRITES = ['header_image'] as const

/** The columns `updatePracticeSettings` writes, as the action reads them off its FormData. */
export const PRACTICE_SETTINGS_WRITES = ['title', 'summary', 'description', 'duration_min', 'category'] as const

/** The column `updatePracticePermalink` writes. */
export const PRACTICE_PERMALINK_WRITES = ['slug'] as const

export interface PracticeRailPlan {
  cover: RailForm
  settings: RailForm
  permalink: RailForm
}

export const PRACTICE_RAIL: PracticeRailPlan = {
  cover: railForm(PRACTICE_MANIFEST, PRACTICE_COVER_WRITES),
  settings: railForm(PRACTICE_MANIFEST, PRACTICE_SETTINGS_WRITES, { hostInline: true }),
  permalink: railForm(PRACTICE_MANIFEST, PRACTICE_PERMALINK_WRITES),
}

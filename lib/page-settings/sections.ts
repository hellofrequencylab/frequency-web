// The on-page PAGE settings spine — the settings that tune THE INTERIOR of a page
// (the view *within* the page container), surfaced on the page itself for staff (the
// "Page" group in the on-page Settings panel, components/admin/page-settings/
// page-settings-module.tsx).
//
// SCOPE — interior only. These adjust what shows *inside* the page and how it reads:
// its sections/modules, its own interior right column, its meta, its visibility. They
// deliberately DO NOT touch the app SHELL chrome (the global left nav + global right
// rail + header). The shell rail is platform chrome, managed once in the back end
// (/admin/page-layout, page_chrome_overrides), not per page here. So when a page calls
// for a "right rail", it means the page's own interior column, never the shell rail.
//
// Pure + dependency-light so it is unit-tested (sections.test.ts) and safe to import
// from a client component.

import { isStaff, type WebRole } from '@/lib/core/roles'

/** 'live' = wired end-to-end today · 'next' = shown in the panel, activates in a
 *  following shift (the data store / consumption path is not built yet). */
export type PageSettingStatus = 'live' | 'next'

export interface PageSettingSection {
  /** Stable id; the panel switches its control on this. */
  id: 'basics' | 'status' | 'seo' | 'layout'
  /** Operator-facing label. */
  label: string
  /** The spine "question" this setting answers (memorable, ordered). */
  question: string
  /** One plain line describing what the section does. */
  hint: string
  status: PageSettingStatus
}

// Order IS the spine — the hierarchy operators read top to bottom, the same on every page,
// so they learn it once. It runs identity first, then who-can-see, then how-it-shows-up, with
// the interior-layout control last (it only applies on module-driven pages):
//   1. Basics  — the page's identity: title, subtitle, header image.
//   2. Status & visibility — published/draft + the lowest role that can reach it.
//   3. SEO & meta — the search + link-preview description and share image.
//   4. Layout  — which modules show inside the page (module-driven pages only).
// A page exposes only the sections that apply to it; the rest are omitted (see
// page-settings-module.tsx, where the Layout section is dropped off non-module routes).
// Every section is INTERIOR — it tunes the page, never the app shell.
export const PAGE_SETTING_SECTIONS: readonly PageSettingSection[] = [
  {
    id: 'basics',
    label: 'Basics',
    question: 'What is the page called?',
    hint: 'Set the title, subtitle, and header image shown at the top of the page.',
    status: 'live',
  },
  {
    id: 'status',
    label: 'Status & visibility',
    question: 'Who can see it?',
    hint: 'Set draft or published and the lowest role that can reach the page.',
    status: 'live',
  },
  {
    id: 'seo',
    label: 'SEO & meta',
    question: 'How does it show up in search and shares?',
    hint: 'Set the search description and share image for search and link previews.',
    status: 'live',
  },
  {
    id: 'layout',
    label: 'Layout',
    question: 'What shows inside the page?',
    hint: 'Choose which modules show inside the page and their order. Tunes the page, never the app shell.',
    status: 'live',
  },
] as const

/** Who may open the on-page "Page" settings group: the STAFF web_role axis (ADR-208) —
 *  Site Admin or Executive Admin. This is the codebase's meaning of "admin and above",
 *  independent of the community trust ladder (host/guide/mentor). UX gate only; every
 *  underlying server action re-checks. */
export function canManagePageSettings(webRole: WebRole | null | undefined): boolean {
  return isStaff(webRole)
}

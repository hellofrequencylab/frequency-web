// The on-page PAGE settings spine — the page-level (not entity-level) settings an
// operator can tune from the page itself (the staff-only "Page" group in the on-page
// Settings panel, components/admin/page-settings/page-settings-module.tsx).
//
// This is the page-scoped slice of the EMBEDDED-ADMIN spine (docs/EMBEDDED-ADMIN.md):
// where the entity modules answer "what is THIS circle/event", these answer "how is
// THIS PAGE framed, found, gated, and laid out". One ordered, memorable set; each
// section declares whether it is wired LIVE or staged as the NEXT shift, so the panel
// renders the whole intended shape without pretending a staged control works.
//
// Pure + dependency-light so it is unit-tested (sections.test.ts) and safe to import
// from a client component.

import { isStaff, type WebRole } from '@/lib/core/roles'

/** 'live' = wired end-to-end today · 'next' = shown in the panel, activates in a
 *  following shift (the data store / consumption path is not built yet). */
export type PageSettingStatus = 'live' | 'next'

export interface PageSettingSection {
  /** Stable id; the panel switches its control on this. */
  id: 'chrome' | 'seo' | 'status' | 'layout'
  /** Operator-facing label. */
  label: string
  /** The spine "question" this setting answers (memorable, ordered). */
  question: string
  /** One plain line describing what the section does. */
  hint: string
  status: PageSettingStatus
}

// Order is the spine order — same on every page, so operators learn it once.
export const PAGE_SETTING_SECTIONS: readonly PageSettingSection[] = [
  {
    id: 'chrome',
    label: 'Right rail',
    question: 'How is the page framed?',
    hint: 'Pick the right rail this page shows: the community rail, an in-body scope rail, or none for full width.',
    status: 'live',
  },
  {
    id: 'seo',
    label: 'SEO & meta',
    question: 'How does it show up in search and shares?',
    hint: 'Set the title, description, and share image for search and link previews. Activates next.',
    status: 'next',
  },
  {
    id: 'status',
    label: 'Status & visibility',
    question: 'Who can see it?',
    hint: 'Set draft or published and the lowest role that can reach the page. Activates next.',
    status: 'next',
  },
  {
    id: 'layout',
    label: 'Layout',
    question: 'What shows on the page?',
    hint: 'Choose which modules show on the page and their order. Activates next.',
    status: 'next',
  },
] as const

/** Who may open the on-page "Page" settings group: the STAFF web_role axis (ADR-208) —
 *  Site Admin or Executive Admin. This is the codebase's meaning of "admin and above",
 *  independent of the community trust ladder (host/guide/mentor). UX gate only; every
 *  underlying server action re-checks (requireAdmin('admin')). */
export function canManagePageSettings(webRole: WebRole | null | undefined): boolean {
  return isStaff(webRole)
}

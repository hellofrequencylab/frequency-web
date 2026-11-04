// VERA ANSWERS QUESTIONS IN THE WEBSITE EDITOR (LIVE-2110; the Web Assistant plan in
// /mnt/project-files/vera-assistants-2026-11-03/REPORT.md, phase V1 "read tools").
//
// An owner asks "where do I change my search description?" or "is my site ready to publish?". Vera answers from
// two things only, both read in the browser and sent as DATA: this GUIDE (where each control lives in the editor,
// checked against components/sites/editor/shell.tsx) and the draft's FACTS (pages, theme, publish checks, what is
// unpublished). She never guesses a menu path: a question the guide and facts do not cover gets "I don't know
// that one" and a pointer to Help. Answering writes nothing.
//
// PURE: no React, no IO.

import type { Config } from '@/lib/page-editor/types'
import { pendingChangeLabels, publishChecks } from './publish-checks'
import type { WebsiteSnapshot } from './state'

/** Where each thing lives in the editor, in the words on screen. Kept short: it rides on every ask. */
export const WEBSITE_EDITOR_GUIDE: readonly string[] = [
  'The left rail has five tabs: Pages, Layers, Add, Theme and Site.',
  'Pages tab: every page with its state, New page, and Page settings (page name, a page theme, and order). The home page stays first.',
  'Layers tab: the sections of the page in view, plus Header and Footer, which are shared by every page. Drag a layer to reorder it.',
  'Add tab: sections to add to the page in view. Typing / in the Vera bar also opens Add a section.',
  'Theme tab: Change theme, the accent, type that comes with the theme, the Style choices (corners, spacing, header, footer and any the theme adds) and its Looks, plus the logo.',
  'Site tab: Search and sharing for the page in view (page title and description, with the share preview), the website address, Custom domain (set up in Space settings), Header and navigation, Footer, Menu and logo (shared with the Space page) and a link to Space home.',
  'The inspector on the right edits the selected section in four tabs: Content (its words and pictures), Design (background, content width, align, space above and below, columns on grids, and More layout), Advanced (reveal on scroll, Show on desktop, tablet and phone, the anchor link, and Custom code), and Notes (comments for your team).',
  'Comments: select a section, then use Notes in the inspector. Shift-click the page to pin a comment at an exact spot. Comments never publish.',
  'The device switch at the top previews desktop, tablet and phone. Align, spacing and columns can differ per device; Show on in Advanced hides a section on a device.',
  'Save draft keeps your work private (Cmd or Ctrl+S). Undo and Redo step through every change, including the ones Vera applies.',
  'Publish opens the publish window: the checks, the list of changes, Publish now or schedule it for later, and Published versions to restore an earlier one into the draft.',
  'Share copies the live website address.',
  'Theme drafts, at the top of the Theme tab, let you keep more than one theme over the same pages and publish the one you like.',
  'Vera: Cmd or Ctrl+K opens the bar. With nothing selected she can propose layout and style changes, or a new section from the Add tab, for you to tick. With text selected she asks coaching questions about your own words. She never writes your words and never publishes.',
]

/** What Vera may know about this draft. Counts and labels only: never a section's words. */
export interface WebsiteVeraFacts {
  theme: string
  pageInView: string
  pages: { label: string; sections: number; searchDescription: boolean }[]
  checks: { ok: boolean; text: string }[]
  unpublished: string[]
  published: boolean
  scheduledFor: string | null
  /** LIVE-2162: a screenshot the owner dropped into Vera's tab with this ask, as a JPEG or PNG data URL. It is shown
   *  to the model as a picture, never read as instructions, and it is not stored anywhere. */
  screenshot?: string
}

/** The biggest screenshot she takes: the browser shrinks a drop to fit well under this before sending. */
export const MAX_VERA_SCREENSHOT = 1_500_000
const SCREENSHOT = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

export function websiteVeraFacts(p: { draft: WebsiteSnapshot; published: WebsiteSnapshot | null; scheduledAt?: string | null; pageInView: string; themeLabel: string; config: Config }): WebsiteVeraFacts {
  return {
    theme: p.themeLabel.slice(0, 40),
    pageInView: p.pageInView.slice(0, 80),
    pages: p.draft.pages.slice(0, 30).map((page) => ({ label: page.label.slice(0, 80), sections: page.doc.content.length, searchDescription: !!page.seo.description.trim() })),
    checks: publishChecks(p.draft.pages, p.config).map((c) => ({ ok: c.ok, text: c.text.slice(0, 160) })),
    unpublished: pendingChangeLabels(p.draft, p.published).slice(0, 20).map((l) => l.slice(0, 80)),
    published: !!p.published,
    scheduledFor: p.scheduledAt ?? null,
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Read facts that crossed the network: shape and size only. Null when malformed. */
export function readWebsiteVeraFacts(value: unknown): WebsiteVeraFacts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.pages) || v.pages.length > 30 || !Array.isArray(v.checks) || v.checks.length > 12 || !Array.isArray(v.unpublished) || v.unpublished.length > 20) return null
  const pages: WebsiteVeraFacts['pages'] = []
  for (const row of v.pages) {
    if (!row || typeof row !== 'object') return null
    const r = row as Record<string, unknown>
    if (!Number.isSafeInteger(r.sections) || (r.sections as number) < 0) return null
    pages.push({ label: text(r.label, 80), sections: r.sections as number, searchDescription: r.searchDescription === true })
  }
  const checks: WebsiteVeraFacts['checks'] = []
  for (const row of v.checks) {
    if (!row || typeof row !== 'object') return null
    checks.push({ ok: (row as { ok?: unknown }).ok === true, text: text((row as { text?: unknown }).text, 160) })
  }
  const scheduledFor = typeof v.scheduledFor === 'string' && Number.isFinite(Date.parse(v.scheduledFor)) ? v.scheduledFor : null
  if (v.screenshot != null && (typeof v.screenshot !== 'string' || v.screenshot.length > MAX_VERA_SCREENSHOT || !SCREENSHOT.test(v.screenshot))) return null
  return { theme: text(v.theme, 40), pageInView: text(v.pageInView, 80), pages, checks, unpublished: v.unpublished.map((l) => text(l, 80)), published: v.published === true, scheduledFor, ...(typeof v.screenshot === 'string' ? { screenshot: v.screenshot } : {}) }
}

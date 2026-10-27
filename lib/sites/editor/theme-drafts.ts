import { slugify } from '@/lib/utils'
import { MAX_THEME_DRAFTS, type WebsiteLook, type WebsiteSnapshot, type WebsiteTheme, type WebsiteThemeDraft } from './state'

// THEME DRAFTS (owner ask 2026-10-27): an owner can keep several themes alive over the SAME website, edit and preview
// each, and publish the one they like. The pages, words, photos, menu and header are shared; a draft holds only the
// theme and its per-theme settings (brand accent, logo, global styles). Nothing here touches the live site: the
// published theme and styles are written when a draft is published (saveWebsiteDraft), never by picking a draft.
//
// STORED IN THE SNAPSHOT, beside the pages, so autosave, undo and version history carry it for free:
//   · `theme`, `brand`, `look`  the ACTIVE draft's working values (every reader that already knows these keeps working).
//   · `themes` + `activeTheme`  the list, only once there is more than one. The active entry here may be stale; the
//                               snapshot's own values win, and `themeDrafts` settles them back in.
// A website with one theme carries none of this, so every existing snapshot is unchanged.
//
// THE FENCE: a draft's theme is a WEBSITE theme. It styles the stand-alone site render and the editor canvas only,
// never a member, Space console or admin area (app/(main)/no-site-theme-in-member-area.test.ts).

/** What an owner calls each theme. Nocturne is the Midnight theme under its new name; the stored id stays. */
export const THEME_DRAFT_NAME: Record<WebsiteTheme, string> = {
  DAWN: 'Default', Menswork: 'Bold', Wildheart: 'Wildheart', Network: 'Network', Temple: 'Temple', Midnight: 'Nocturne', Designer: 'Designer',
}

const MAIN = 'main'

/** The fields a draft holds, taken from a snapshot's working values. Undefined keys are left out so JSON stays small. */
function working(snapshot: WebsiteSnapshot): Pick<WebsiteThemeDraft, 'theme' | 'brand' | 'look'> {
  return { theme: snapshot.theme, ...(snapshot.brand ? { brand: snapshot.brand } : {}), ...(snapshot.look ? { look: snapshot.look } : {}) }
}

export function activeThemeDraftId(snapshot: WebsiteSnapshot): string {
  return snapshot.activeTheme && (!snapshot.themes || snapshot.themes.some((t) => t.id === snapshot.activeTheme)) ? snapshot.activeTheme : snapshot.themes?.[0]?.id ?? MAIN
}

/** Every draft, with the active one carrying the working values. A website that never used drafts has exactly one. */
export function themeDrafts(snapshot: WebsiteSnapshot): WebsiteThemeDraft[] {
  const active = activeThemeDraftId(snapshot)
  if (!snapshot.themes) return [{ id: active, label: THEME_DRAFT_NAME[snapshot.theme], ...working(snapshot) }]
  return snapshot.themes.map((t) => (t.id === active ? { id: t.id, label: t.label, ...working(snapshot) } : t))
}

/** The draft that is live: the one the published snapshot names, else the one whose theme and brand match it. */
export function liveThemeDraftId(draft: WebsiteSnapshot, published: WebsiteSnapshot | null): string | null {
  if (!published) return null
  const list = themeDrafts(draft)
  if (published.liveTheme && list.some((t) => t.id === published.liveTheme)) return published.liveTheme
  return list.find((t) => t.theme === published.theme && JSON.stringify(t.brand ?? null) === JSON.stringify(published.brand ?? null))?.id ?? null
}

/** Put a list and its active draft back into a snapshot: the active draft's values become the working ones. */
function assemble(snapshot: WebsiteSnapshot, list: WebsiteThemeDraft[], activeId: string): WebsiteSnapshot {
  const { themes: _t, activeTheme: _a, brand: _b, look: _l, ...rest } = snapshot
  void _t; void _a; void _b; void _l
  const active = list.find((t) => t.id === activeId) ?? list[0]
  return {
    ...rest, theme: active.theme,
    ...(active.brand ? { brand: active.brand } : {}),
    ...(active.look ? { look: active.look } : {}),
    ...(list.length > 1 ? { themes: list, activeTheme: active.id } : {}),
  }
}

/** A draft id for a label: lowercase words, unique among the list. */
function freeId(label: string, taken: Set<string>): string {
  const base = slugify(label).slice(0, 30).replace(/-+$/, '') || 'theme'
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${taken.size}`
}

function cleanDraftLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 60)
}

type Change = { ok: true; snapshot: WebsiteSnapshot; id: string } | { ok: false; error: string }

/** Start a new draft on `theme` and show it. It begins as that theme's own look over the same content; `from` copies
 *  another draft's per-theme settings (a variant of a theme) when that draft is on the same theme. */
export function addThemeDraft(snapshot: WebsiteSnapshot, theme: WebsiteTheme, label?: string, from?: string): Change {
  const list = themeDrafts(snapshot)
  if (list.length >= MAX_THEME_DRAFTS) return { ok: false, error: `You can keep ${MAX_THEME_DRAFTS} theme drafts. Remove one first.` }
  const name = cleanDraftLabel(label ?? '') || THEME_DRAFT_NAME[theme]
  const copy = from ? list.find((t) => t.id === from && t.theme === theme) : undefined
  const id = freeId(name, new Set(list.map((t) => t.id)))
  const draft: WebsiteThemeDraft = { id, label: name, theme, ...(copy?.brand ? { brand: structuredClone(copy.brand) } : {}), ...(copy?.look ? { look: { ...copy.look } } : {}) }
  return { ok: true, id, snapshot: assemble(snapshot, [...list, draft], id) }
}

/** Show another draft. The pages are untouched; only the theme and its settings change. */
export function switchThemeDraft(snapshot: WebsiteSnapshot, id: string): Change {
  const list = themeDrafts(snapshot)
  if (!list.some((t) => t.id === id)) return { ok: false, error: 'That theme draft is gone.' }
  return { ok: true, id, snapshot: assemble(snapshot, list, id) }
}

export function renameThemeDraft(snapshot: WebsiteSnapshot, id: string, label: string): Change {
  const name = cleanDraftLabel(label)
  if (!name) return { ok: false, error: 'Give the draft a name.' }
  const list = themeDrafts(snapshot)
  if (!list.some((t) => t.id === id)) return { ok: false, error: 'That theme draft is gone.' }
  return { ok: true, id, snapshot: assemble(snapshot, list.map((t) => (t.id === id ? { ...t, label: name } : t)), activeThemeDraftId(snapshot)) }
}

/** Remove a draft. The last one cannot go, and neither can the one that is live (publish another first). */
export function removeThemeDraft(snapshot: WebsiteSnapshot, id: string, liveId: string | null): Change {
  const list = themeDrafts(snapshot)
  if (list.length < 2) return { ok: false, error: 'A website needs at least one theme.' }
  if (id === liveId) return { ok: false, error: 'This is the draft your visitors see. Publish another one first.' }
  if (!list.some((t) => t.id === id)) return { ok: false, error: 'That theme draft is gone.' }
  const rest = list.filter((t) => t.id !== id)
  const active = activeThemeDraftId(snapshot)
  const next = rest.some((t) => t.id === active) ? active : rest[0].id
  return { ok: true, id: next, snapshot: assemble(snapshot, rest, next) }
}

/** The global styles a draft publishes: every key, `null` where the draft leaves it to the theme. Undefined when the
 *  draft never set any (the site's current styles stand). */
export function draftLook(look: WebsiteLook | undefined): { corners: string | null; spacing: string | null; header: string | null; footer: string | null } | undefined {
  if (!look) return undefined
  return { corners: look.corners ?? null, spacing: look.spacing ?? null, header: look.header ?? null, footer: look.footer ?? null }
}

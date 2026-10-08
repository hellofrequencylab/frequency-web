import type { Data } from '@/lib/page-editor/types'

// Website-only documents. Never written to pageDocs/profileLayout; public readers
// consume only published. Bounded snapshots until E0's shared document store lands.
export type WebsiteTheme = 'Menswork' | 'DAWN' | 'Midnight'
export type Device = 'desktop' | 'tablet' | 'phone'
interface SiteCommentReply { id: string; body: string; author: string; createdAt: string }
export interface SiteComment { id: string; blockId: string; text: string; author: string; createdAt: string; resolved: boolean; x?: number; y?: number; replies?: SiteCommentReply[] }
interface WebsitePage {
  slug: string; label: string; doc: Data
  seo: { title: string; description: string }
  comments: SiteComment[]
}
interface WebsiteBrand { logo?: string | null; accent?: string | null }
export interface WebsiteSnapshot { theme: WebsiteTheme; brand?: WebsiteBrand; pages: WebsitePage[] }
interface WebsiteVersion { id: string; createdAt: string; author: string; snapshot: WebsiteSnapshot }
export interface WebsiteEditorState {
  v: 1; revision: number; draft: WebsiteSnapshot
  published: WebsiteSnapshot | null; scheduled?: { at: string; author: string; snapshot: WebsiteSnapshot } | null; versions: WebsiteVersion[]
}
export const RESERVED_WEBSITE_SLUGS = new Set(['admin', 'book', 'contact', 'spotlight', 'api', 'opengraph-image', 'robots', 'sitemap'])
export const WEBSITE_THEMES: WebsiteTheme[] = ['Menswork', 'DAWN', 'Midnight']
const MAX_WEBSITE_BYTES = 700_000
const MAX_VERSIONS = 8
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

function validWebsiteLogo(value: string): boolean {
  if (/^\/(?!\/)[^\\\s]*$/.test(value)) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

/** Undefined inherits the original website; explicit null clears its override. */
export function resolveWebsiteBrand(snapshot: WebsiteSnapshot | null, original: { logo?: string | null; accent?: string | null }): { logo: string | null; accent: string | null } {
  const brand = snapshot?.brand
  return {
    logo: brand && Object.prototype.hasOwnProperty.call(brand, 'logo') ? brand.logo ?? null : original.logo ?? null,
    accent: brand && Object.prototype.hasOwnProperty.call(brand, 'accent') ? brand.accent ?? null : original.accent ?? null,
  }
}

function validCommentPosition(comment: Record<string, unknown>): boolean {
  if (comment.x === undefined && comment.y === undefined) return true
  return [comment.x, comment.y].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
}
function validCommentReplies(replies: unknown): boolean {
  if (replies === undefined) return true
  const ids = new Set<string>()
  return Array.isArray(replies) && replies.length <= 100 && replies.every((reply) => {
    if (!record(reply) || !text(reply.id, 100) || !reply.id.trim() || ids.has(reply.id) || !text(reply.body, 2000) || !reply.body.trim() || !text(reply.author, 100) || !text(reply.createdAt, 40) || !Number.isFinite(Date.parse(reply.createdAt))) return false
    ids.add(reply.id)
    return true
  })
}

export function validWebsiteSnapshot(v: unknown): v is WebsiteSnapshot {
  if (!record(v) || !WEBSITE_THEMES.includes(v.theme as WebsiteTheme) || !Array.isArray(v.pages) || !v.pages.length || v.pages.length > 30) return false
  if (v.brand !== undefined) {
    if (!record(v.brand) || Object.keys(v.brand).some((key) => !['logo', 'accent'].includes(key))) return false
    if (v.brand.accent != null && (typeof v.brand.accent !== 'string' || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v.brand.accent))) return false
    if (v.brand.logo != null && (!text(v.brand.logo, 2000) || !validWebsiteLogo(v.brand.logo))) return false
  }
  const slugs = new Set<string>()
  for (const p of v.pages) {
    if (!record(p) || !text(p.slug, 64) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || RESERVED_WEBSITE_SLUGS.has(p.slug) || slugs.has(p.slug)) return false
    slugs.add(p.slug)
    if (!text(p.label, 80) || !p.label.trim() || !record(p.doc) || !record(p.doc.root) || !Array.isArray(p.doc.content) || p.doc.content.length > 200) return false
    if (p.doc.root.props !== undefined && !record(p.doc.root.props)) return false
    const layout = record(p.doc.root.props) ? p.doc.root.props.websiteLayout : undefined
    if (layout !== undefined && (!record(layout) || Object.keys(layout).length > 200)) return false
    const ids = new Set<string>()
    let visited = 0
    function visit(value: unknown, depth = 0): boolean {
      if (++visited > 20_000 || depth > 30) return false
      if (Array.isArray(value)) return value.every((child) => visit(child, depth + 1))
      if (!record(value)) return true
      if ('type' in value && 'props' in value) {
        if (!text(value.type, 100) || !record(value.props) || !text(value.props.id, 160) || !value.props.id.trim() || ids.has(value.props.id)) return false
        ids.add(value.props.id)
      }
      return Object.values(value).every((child) => visit(child, depth + 1))
    }
    if (!p.doc.content.every((b: unknown) => record(b) && 'type' in b && 'props' in b && visit(b))) return false
    if (!record(p.seo) || !text(p.seo.title, 200) || !text(p.seo.description, 500)) return false
    const commentIds = new Set<string>()
    if (!Array.isArray(p.comments) || p.comments.length > 100 || !p.comments.every((c: unknown) => record(c) && text(c.id, 100) && !!c.id.trim() && !commentIds.has(c.id) && !!commentIds.add(c.id) && text(c.blockId, 160) && ids.has(c.blockId) && text(c.text, 2000) && text(c.author, 100) && text(c.createdAt, 40) && Number.isFinite(Date.parse(c.createdAt)) && typeof c.resolved === 'boolean' && validCommentPosition(c) && validCommentReplies(c.replies))) return false
  }
  return slugs.has('home') && new TextEncoder().encode(JSON.stringify(v)).length <= MAX_WEBSITE_BYTES
}

export function readWebsiteEditor(preferences: unknown): WebsiteEditorState | null {
  const s = record(preferences) ? preferences.websiteEditor : null
  if (!record(s) || s.v !== 1 || !Number.isSafeInteger(s.revision) || (s.revision as number) < 0 || !validWebsiteSnapshot(s.draft)) return null
  if (s.published !== null && !validWebsiteSnapshot(s.published)) return null
  if (!Array.isArray(s.versions) || s.versions.length > MAX_VERSIONS || !s.versions.every((v) => record(v) && text(v.id, 100) && text(v.author, 100) && text(v.createdAt, 40) && Number.isFinite(Date.parse(v.createdAt)) && validWebsiteSnapshot(v.snapshot))) return null
  if (s.scheduled != null && (!record(s.scheduled) || !text(s.scheduled.at, 40) || !Number.isFinite(Date.parse(s.scheduled.at)) || !text(s.scheduled.author, 100) || !validWebsiteSnapshot(s.scheduled.snapshot))) return null
  return s as unknown as WebsiteEditorState
}

export function publishedWebsitePage(preferences: unknown, slug: string): WebsitePage | null {
  return publishedWebsiteSnapshot(preferences)?.pages.find((p) => p.slug === slug) ?? null
}

export function publishedWebsiteSnapshot(preferences: unknown): WebsiteSnapshot | null {
  const editor = record(preferences) ? preferences.websiteEditor : null
  const published = record(editor) ? editor.published : null
  return validWebsiteSnapshot(published) ? published : null
}

export function withoutWebsiteDrafts<T>(preferences: T): T {
  if (!record(preferences) || !('websiteEditor' in preferences)) return preferences
  const { websiteEditor: _private, ...rest } = preferences
  void _private
  return rest as T
}

export function nextWebsiteState(current: WebsiteEditorState, draft: WebsiteSnapshot, publish: boolean, author: string, now = new Date().toISOString(), scheduledAt?: string): WebsiteEditorState {
  if (!validWebsiteSnapshot(draft)) throw new Error('Invalid website draft')
  const snapshot = structuredClone(draft)
  // Comments stay in the private draft; even a direct public row projection cannot
  // carry a private review thread in its published document.
  const publicSnapshot = { ...snapshot, pages: snapshot.pages.map((p) => ({ ...p, comments: [] })) }
  return {
    v: 1, revision: current.revision + 1, draft: snapshot,
    published: publish ? publicSnapshot : current.published,
    scheduled: publish ? null : scheduledAt ? { at: scheduledAt, author, snapshot: publicSnapshot } : current.scheduled ?? null,
    versions: publish ? [{ id: String(current.revision + 1), createdAt: now, author, snapshot: publicSnapshot }, ...current.versions].slice(0, MAX_VERSIONS) : current.versions,
  }
}

export interface SectionDisplay { padding?: number; hidden?: boolean; gap?: number; columns?: number; textSize?: number; bodySize?: number; bodyFont?: 'display' | 'body' | 'mono'; textFont?: 'display' | 'body' | 'mono'; align?: 'left' | 'center' | 'right'; animation?: 'none' | 'fade' | 'rise'; className?: string; attributes?: string; placements?: Record<string, { column: number; span: number; row: number }> }
export function sectionDisplay(doc: Data, id: string, device: Device): SectionDisplay {
  const layout = doc.root.props?.websiteLayout ?? {}
  const entry = layout[id] ?? {}
  const clean = (x: SectionDisplay): SectionDisplay => ({
    ...(typeof x.padding === 'number' && Number.isFinite(x.padding) ? { padding: Math.min(160, Math.max(0, x.padding)) } : {}),
    ...(typeof x.hidden === 'boolean' ? { hidden: x.hidden } : {}),
    ...(typeof x.gap === 'number' && Number.isFinite(x.gap) ? { gap: Math.min(160, Math.max(0, x.gap)) } : {}),
    ...(typeof x.columns === 'number' && Number.isFinite(x.columns) ? { columns: Math.min(4, Math.max(1, Math.round(x.columns))) } : {}),
    ...(typeof x.textSize === 'number' && Number.isFinite(x.textSize) ? { textSize: Math.min(120, Math.max(0, x.textSize)) } : {}),
    ...(typeof x.bodySize === 'number' && Number.isFinite(x.bodySize) ? { bodySize: Math.min(120, Math.max(0, x.bodySize)) } : {}),
    ...(['display', 'body', 'mono'].includes(x.bodyFont ?? '') ? { bodyFont: x.bodyFont } : {}),
    ...(['display', 'body', 'mono'].includes(x.textFont ?? '') ? { textFont: x.textFont } : {}),
    ...(['left', 'center', 'right'].includes(x.align ?? '') ? { align: x.align } : {}),
    ...(['none', 'fade', 'rise'].includes(x.animation ?? '') ? { animation: x.animation } : {}),
    ...(typeof x.className === 'string' ? { className: x.className.slice(0, 200) } : {}),
    ...(typeof x.attributes === 'string' ? { attributes: x.attributes.slice(0, 1000) } : {}),
    ...(record(x.placements) ? { placements: Object.fromEntries(Object.entries(x.placements).slice(0, 100).filter(([key, p]) => /^\d+(?:\.\d+){0,10}$/.test(key) && record(p) && (['column', 'span', 'row'] as const).every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]))).map(([key, p]) => [key, { column: Math.min(12, Math.max(1, Math.round(p.column))), span: Math.min(12, Math.max(1, Math.round(p.span))), row: Math.min(100, Math.max(1, Math.round(p.row))) }])) } : {}),
  })
  return clean({ ...entry.desktop, ...(device !== 'desktop' ? entry[device] : {}) })
}

export function updateSectionDisplay(doc: Data, id: string, device: Device, value: SectionDisplay | null): Data {
  const props = doc.root.props ?? {}
  const layout = props.websiteLayout ?? {}
  const entry = { ...layout[id] }
  if (value === null) delete entry[device]
  else entry[device] = device === 'desktop' ? value : Object.fromEntries(Object.entries(value).filter(([key, setting]) => JSON.stringify(setting) !== JSON.stringify(entry.desktop?.[key as keyof SectionDisplay])))
  return { ...doc, root: { ...doc.root, props: { ...props, websiteLayout: { ...layout, [id]: entry } } } }
}

export interface WebsitePresence {
  profileId: string
  name: string
  cursor: { pageSlug: string; blockId: string; x: number; y: number } | null
}

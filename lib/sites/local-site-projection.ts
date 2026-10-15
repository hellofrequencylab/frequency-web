import 'server-only'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { Space } from '@/lib/spaces/types'

const GROUP_ID = 'db42cbea-3229-9813-e691-cb0e05272808'
const projected = new WeakSet<object>()
type Obj = Record<string, unknown>
type Env = Record<string, string | undefined>
const record = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function refuse(reason: string): never { throw new Error(`Local site projection refused: ${reason}`) }

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  return record(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
}
export const localProjectionHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export function localProjectionDocuments(preferences: unknown): Obj {
  const prefs = record(preferences) ? preferences : {}
  const editor = record(prefs.websiteEditor) ? prefs.websiteEditor : {}
  return { pageDocs: prefs.pageDocs ?? null, publishedWebsite: editor.published ?? null }
}
export const isLocalSiteProjection = (space: Space): boolean => projected.has(space)

function localPath(env: Env): string | null {
  if (env.VERCEL_ENV !== 'development' || !env.LOCAL_SITE_CONTENT_PROJECTION?.trim()) return null
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null
  } catch { return null }
  const path = env.LOCAL_SITE_CONTENT_PROJECTION.trim()
  return isAbsolute(path) && path.endsWith('.json') ? path : refuse('the explicit local JSON path must be absolute')
}

function at(root: Obj, parts: string[]): unknown {
  let value: unknown = root
  for (const part of parts) {
    if (['__proto__', 'prototype', 'constructor'].includes(part) || !value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return refuse('a reviewed path no longer exists')
    value = (value as Obj)[part]
  }
  return value
}

function applyOperation(root: Obj, raw: unknown): void {
  if (!record(raw) || !['add', 'replace'].includes(String(raw.op)) || typeof raw.path !== 'string' || typeof raw.value !== 'string') refuse('malformed operation')
  const op = raw as Obj & { path: string; value: string }
  const match = /^\/preferences\/(?:pageDocs\/[a-z0-9-]+|websiteEditor\/published\/pages\/(?:0|[1-9]\d*)\/doc)\/content\/(?:0|[1-9]\d*)\/props\/(.+)$/.exec(op.path)
  if (!match) refuse('only reviewed public website document fields may be projected')
  const parts = op.path.slice(1).split('/')
  const propsIndex = parts.lastIndexOf('props')
  const block = at(root, parts.slice(0, propsIndex)) as Obj
  const field = match[1]
  const parent = at(root, parts.slice(0, -1)) as Obj
  const key = parts.at(-1)!
  const before = parent[key]
  if (op.op === 'replace' && localProjectionHash(before ?? null) !== localProjectionHash(op.before ?? null)) refuse('an authored value changed')
  if (op.op === 'add' && before != null && before !== '') refuse('an added field is already authored')
  if (/^circles\/(?:0|[1-9]\d*)\/circleSlug$/.test(field)) {
    if (block.type !== 'NetworkCircles' || parent.title !== op.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(op.value)) refuse('invalid circle mapping')
  } else if (/^chapters\/(?:0|[1-9]\d*)\/spaceId$/.test(field)) {
    if (block.type !== 'NetworkEvents' || parent.label !== op.label || !uuid.test(op.value)) refuse('invalid chapter mapping')
  } else if (field === 'actionHref' || field === 'actionSecondaryHref') {
    const label = field === 'actionHref' ? 'actionLabel' : 'actionSecondaryLabel'
    if (parent[label] !== 'Start a circle' || op.value !== '/sign-in?next=%2Fcircles%2Fnew') refuse('invalid native circle action')
  } else if (/^products\/(?:0|[1-9]\d*)\/href$/.test(field)) {
    if (block.type !== 'NetworkMerch' || parent.title !== op.title || !op.value.startsWith('/market/') || !uuid.test(op.value.slice(8))) refuse('invalid product mapping')
  } else if (field === 'buyLabel') {
    if (block.type !== 'NetworkMerch' || op.value !== 'View product') refuse('invalid product action label')
  } else refuse('unreviewed document field')
  parent[key] = op.value
}

/** Local read projection only. Canonical visibility/publish reads happen before this seam; no writes. */
export async function projectLocalSiteSpace(space: Space | null, options: { env?: Env; readFile?: (path: string) => Promise<string> } = {}): Promise<Space | null> {
  if (!space || space.id !== GROUP_ID || space.slug !== 'the-group') return space
  const path = localPath(options.env ?? process.env)
  if (!path) return space
  const read = options.readFile ?? (async (file: string) => (await import('node:fs/promises')).readFile(file, 'utf8'))
  const text = await read(path)
  if (text.length > 1_000_000) refuse('the local manifest exceeds its size limit')
  const manifest: unknown = JSON.parse(text)
  if (!record(manifest) || manifest.spaceId !== GROUP_ID || manifest.slug !== 'the-group' || manifest.applied !== false || !Array.isArray(manifest.operations) || manifest.operations.length > 100) refuse('invalid local review manifest')
  if (manifest.expectedBaseHash !== localProjectionHash(localProjectionDocuments(space.preferences))) refuse('the current published documents drifted from the reviewed snapshot')
  if (manifest.expectedOperationsHash !== localProjectionHash(manifest.operations)) refuse('the reviewed operations changed')
  const preferences = structuredClone(space.preferences ?? {})
  const root = { preferences }
  for (const operation of manifest.operations) applyOperation(root, operation)
  const result = { ...space, preferences }
  projected.add(result)
  return result
}

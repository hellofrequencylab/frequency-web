'use server'
import { authorizeWebsiteEditor } from './authorization'
import { uploadAuthorizedLoomImage } from '@/lib/loom/authorized-image-upload'
import { toPickAsset, notExpiredOr, type LoomPickAsset } from '@/lib/library/store'
import type { LoomPickerConfig, LoomScope } from '@/lib/loom/picker-actions'
const CONFIG: LoomPickerConfig = { tabs: { images: true, icons: false, elements: false, tags: true, spaces: false, airwaves: false }, defaultScope: 'space' }
function scopeFor(space: { id: string; name: string }): LoomScope { return { key: space.id, label: space.name, kind: 'space' } }
export async function websiteLoomScopes(host: string): Promise<{ scopes: LoomScope[]; config: LoomPickerConfig }> {
  const auth = await authorizeWebsiteEditor(host)
  return { scopes: auth ? [scopeFor(auth.space)] : [], config: CONFIG }
}
export async function websiteLoomScope(host: string, scopeKey: string): Promise<{ scope: LoomScope | null; config: LoomPickerConfig }> {
  const auth = await authorizeWebsiteEditor(host)
  return { scope: auth && (scopeKey === auth.space.id || scopeKey === auth.space.slug) ? scopeFor(auth.space) : null, config: CONFIG }
}
export async function websiteLoomImages(host: string, scopeKey: string, opts: { q?: string; tag?: string; kinds?: string[]; generatedOnly?: boolean; shared?: 'with' | 'only' } = {}): Promise<{ assets: LoomPickAsset[]; tags: string[] }> {
  const auth = await authorizeWebsiteEditor(host)
  if (!auth || (scopeKey !== auth.space.id && scopeKey !== auth.space.slug)) return { assets: [], tags: [] }
  // Website passes have one site scope. Private/protected master URLs never leave it.
  let query = auth.db.from('library_assets').select('id,title,url,alt,kind,tags,config,category,is_protected,expires_at').eq('space_id', auth.space.id).eq('kind', 'image').neq('status', 'archived').or('is_protected.is.null,is_protected.eq.false').or(notExpiredOr())
  const q = typeof opts.q === 'string' ? opts.q.slice(0, 200).replace(/[,()*%]/g, ' ').trim() : ''
  if (q) query = query.ilike('title', `%${q}%`)
  if (typeof opts.tag === 'string' && opts.tag.length <= 100) query = query.contains('tags', [opts.tag])
  const { data, error } = await query.order('created_at', { ascending: false }).limit(120)
  if (error) return { assets: [], tags: [] }
  const assets = ((data ?? []) as unknown as Record<string, unknown>[]).filter((row) => typeof row.url === 'string' && /^https?:\/\//.test(row.url) && row.is_protected !== true).map(toPickAsset)
  return { assets, tags: [...new Set(assets.flatMap((asset) => asset.tags))].sort() }
}
export async function uploadWebsiteLoomImage(host: string, scopeKey: string, formData: FormData): Promise<{ url: string; id: string } | { error: string }> {
  const auth = await authorizeWebsiteEditor(host)
  if (!auth || (scopeKey !== auth.space.id && scopeKey !== auth.space.slug)) return { error: 'Your editing session ended. Reopen the builder to add photos.' }
  try { return await uploadAuthorizedLoomImage(auth.space.id, auth.profileId, formData, true) }
  catch { return { error: 'Could not upload this photo. Choose another image or try again.' } }
}

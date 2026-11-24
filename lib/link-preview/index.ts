import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { log } from '@/lib/log'
import { fetchPinned, isBlockedAddress } from '@/lib/net/pinned-fetch'
import { isIP } from 'node:net'
import { normalizeUrl, parsePreview } from './core'
import { isOwnHost } from './own-hosts'

// LINK PREVIEWS, the fetch (LIVE-2530). Called by the room and DM send actions with the service-role
// client they already hold, for the first outside link in a message. A cached row younger than 7
// days is reused; otherwise the page is fetched through lib/net/pinned-fetch, which refuses private,
// loopback, link-local (169.254) and every other non-public address, pins the socket to the one
// address it checked (no DNS rebinding), re-checks each redirect, caps the body and times out. Only
// the page's <head> metadata is kept. Best effort: any failure is a link without a card, never a
// failed send. This module creates no client, so it adds nothing to the admin-client ratchet.

export const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A first, cheap refusal before any network or cache work: a bare name with no dot (localhost, an
 * intranet box), a .local/.internal/.localhost name, or an IP literal outside public space. The
 * pinned fetch re-checks every resolved address anyway; this keeps those links out of the cache.
 */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (isIP(h)) return !isBlockedAddress(h)
  if (!h.includes('.')) return false
  return !/\.(local|localhost|internal|lan|home|corp|intranet)$/.test(h)
}

export async function getLinkPreview(admin: SupabaseClient<Database>, rawUrl: string): Promise<void> {
  const url = normalizeUrl(rawUrl)
  // Our own pages get a live card under the viewer's access instead (lib/link-preview/actions.ts).
  if (!url) return
  const host = new URL(url).hostname
  if (isOwnHost(host) || !isPublicHost(host)) return
  try {
    const { data: cached } = await admin.from('link_previews').select('fetched_at').eq('url', url).maybeSingle()
    if (cached && Date.now() - Date.parse(cached.fetched_at) < PREVIEW_TTL_MS) return

    const res = await fetchPinned(url, {
      maxBytes: 512 * 1024,
      truncate: true,
      timeoutMs: 4000,
      headers: { 'user-agent': 'FrequencyLinkPreview/1.0 (+https://frequencylocal.com)', accept: 'text/html,application/xhtml+xml' },
      accept: (status, headers) => status >= 200 && status < 300 && /text\/html|application\/xhtml/i.test(headers['content-type'] ?? ''),
    })
    const page = res ? parsePreview(res.body.toString('utf8'), res.finalUrl) : null
    const ok = !!page?.title
    const { error } = await admin.from('link_previews').upsert(
      {
        url,
        ok,
        title: page?.title ?? null,
        description: page?.description ?? null,
        image_url: page?.imageUrl ?? null,
        site_name: page?.siteName ?? null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'url' },
    )
    if (error) log.warn('link_preview.store_failed', { error: error.message })
  } catch (err) {
    log.warn('link_preview.fetch_failed', { error: err instanceof Error ? err.message : String(err) })
  }
}

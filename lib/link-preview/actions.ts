'use server'

import { createClient } from '@/lib/supabase/server'
import { isOwnHost } from './own-hosts'
import { normalizeUrl } from './core'

// READING A CARD (LIVE-2530). Under the viewer's own session, so a card never shows them anything
// their own access would not. An outside link reads the cached metadata the send action stored
// (lib/link-preview/index.ts). A link to one of our own pages reads the live item instead: an
// event or a Space by slug, through the same RLS as the page itself, so a private event shows no card.

export type LinkCard =
  | { kind: 'outside'; url: string; host: string; title: string; description: string | null; imageUrl: string | null; siteName: string | null }
  | { kind: 'own'; url: string; title: string; label: string }

export async function readLinkCard(rawUrl: string): Promise<LinkCard | null> {
  const url = typeof rawUrl === 'string' ? normalizeUrl(rawUrl) : null
  if (!url) return null
  const parsed = new URL(url)
  const supabase = await createClient()

  if (isOwnHost(parsed.hostname)) {
    const [section, slug] = parsed.pathname.split('/').filter(Boolean)
    if (!slug || !/^[a-z0-9-]{1,120}$/i.test(slug)) return null
    if (section === 'events') {
      const { data } = await supabase.from('events').select('title').eq('slug', slug).maybeSingle()
      return data?.title ? { kind: 'own', url, title: data.title, label: 'Event' } : null
    }
    if (section === 'spaces') {
      const { data } = await supabase.from('spaces').select('name').eq('slug', slug).maybeSingle()
      return data?.name ? { kind: 'own', url, title: data.name, label: 'Space' } : null
    }
    return null
  }

  const { data } = await supabase
    .from('link_previews')
    .select('ok, title, description, image_url, site_name')
    .eq('url', url)
    .maybeSingle()
  if (!data?.ok || !data.title) return null
  return {
    kind: 'outside',
    url,
    host: parsed.hostname.replace(/^www\./, ''),
    title: data.title,
    description: data.description,
    imageUrl: data.image_url,
    siteName: data.site_name,
  }
}

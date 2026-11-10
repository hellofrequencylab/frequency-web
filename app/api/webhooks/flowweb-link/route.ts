// FlowWeb draft links as Frequency short links (LIVE-2257). FlowWeb's daemon POSTs `{ url, title }` here
// for each draft it writes, signed with FLOWWEB_OUTCOMES_SECRET as hex HMAC-SHA256 of
// `${x-flowweb-timestamp}.${body}` in x-flowweb-signature (the flowweb-claim scheme), and gets back a
// /q/<slug> short link to put in the draft instead of the long tracked one. The link is an ordinary
// managed url code in qr_codes, so it shows in the admin link list, counts its scans and keeps every
// utm_* param of the destination. The same url always answers the same short link. Until the secret is
// set every request is refused (401). Only pages on this site that carry utm_source=flowweb qualify.
// Logic: lib/flowweb/short-link.ts.

import { NextResponse } from 'next/server'
import { envStringOrNull } from '@/lib/env/string'
import { verifySignature } from '@/lib/flowweb/claim'
import { parseLinkRequest } from '@/lib/flowweb/short-link'
import { generateSlug } from '@/lib/qr/codes'
import { shortLinkUrl } from '@/lib/qr/links'
import { SITE_URL } from '@/lib/site'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UNIQUE_VIOLATION = '23505'

export async function POST(req: Request) {
  const secret = envStringOrNull('FLOWWEB_OUTCOMES_SECRET') ?? ''
  const body = await req.text()
  const ts = req.headers.get('x-flowweb-timestamp') ?? ''
  const sig = req.headers.get('x-flowweb-signature') ?? ''
  if (!verifySignature(secret, ts, body, sig)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'the body is not JSON' }, { status: 400 })
  }
  const link = parseLinkRequest(raw, SITE_URL)
  if ('error' in link) return NextResponse.json({ error: link.error }, { status: 400 })

  const db = createAdminClient()
  try {
    const { data: existing } = await db
      .from('qr_codes')
      .select('slug')
      .eq('destination_type', 'url')
      .eq('target_url', link.url)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    if (existing) return NextResponse.json({ short_url: shortLinkUrl(existing.slug), slug: existing.slug })
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await db
        .from('qr_codes')
        .insert({
          slug: generateSlug(),
          title: link.title,
          destination_type: 'url',
          target_url: link.url,
          source_tag: link.sourceTag,
          active: true,
        })
        .select('slug')
        .single()
      if (!error && data) {
        log.info('flowweb.link', { slug: data.slug, source_tag: link.sourceTag })
        return NextResponse.json({ short_url: shortLinkUrl(data.slug), slug: data.slug })
      }
      if (error?.code !== UNIQUE_VIOLATION) throw error
    }
    throw new Error('no free slug after six tries')
  } catch (err) {
    log.error('flowweb.link_failed', { error: (err as Error)?.message ?? String(err) })
    return NextResponse.json({ error: 'could not make the link' }, { status: 500 })
  }
}

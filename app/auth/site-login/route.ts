import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { siteBaseUrl } from '@/lib/sites/seo'
import { appOrigin } from '@/lib/sites/host'
import { safeSitePath, signVisitorHandoff } from '@/lib/sites/site-visitor'

// A WEBSITE'S LOG IN, FREQUENCY SIDE (LIVE-1207, lib/sites/site-visitor.ts). The site header's Log in lands
// here: /auth/site-login?slug=<space>&next=/<page>. The destination is never taken from the request: it is
// the Space's own website origin, worked out here, so this cannot send anyone anywhere else.
//
//   Signed out: the person signs in and comes straight back here.
//   Signed in:  a CONFIRM page names the site and the person ("Continue to X as Dana?"). Only its button
//               (a same-origin POST) mints the 60-second handoff token, which carries the person's display
//               name, handle and photo to that one host. Without the confirm step any website owner could
//               bounce a signed-in member through a link and learn who they are without a click.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

async function resolve(slugRaw: string | null, nextRaw: string | null) {
  const origin = appOrigin()
  const slug = (slugRaw ?? '').trim().toLowerCase()
  const next = safeSitePath(nextRaw)
  const space = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? await getSiteSpace(slug) : null
  if (!space) return null
  const base = siteBaseUrl(space.slug, await boundSiteDomain(space), origin)
  const host = /^https:\/\/([^/]+)$/.exec(base)?.[1] ?? null
  return { origin, space, next, base, host }
}

async function ownProfile(profileId: string) {
  const supabase = await createClient() // the person's own session, so RLS decides what this reads
  const { data } = await supabase.from('profiles').select('display_name, handle, avatar_url').eq('id', profileId).maybeSingle()
  const row = data as { display_name?: string | null; handle?: string | null; avatar_url?: string | null } | null
  return { name: row?.display_name?.trim() || row?.handle || 'Member', handle: row?.handle ?? null, avatarUrl: row?.avatar_url ?? null }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const found = await resolve(url.searchParams.get('slug'), url.searchParams.get('next'))
  if (!found) return new NextResponse('Not found', { status: 404 })
  const { origin, space, next, base, host } = found
  const profileId = await getMyProfileId()
  if (!profileId) {
    const back = `/auth/site-login?slug=${encodeURIComponent(space.slug)}&next=${encodeURIComponent(next)}`
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(back)}`, origin), 303)
  }
  // A site that lives under Frequency's own /sites path shares this session already: nothing to hand off.
  if (!host) return NextResponse.redirect(`${base}${next === '/' ? '' : next}`, 303)

  const me = await ownProfile(profileId)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Continue to ${esc(space.name)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText}main{max-width:420px;margin:24px;padding:32px;border-radius:20px;border:1px solid GrayText}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:GrayText}button{font:inherit;font-weight:600;padding:12px 22px;border:0;border-radius:999px;background:CanvasText;color:Canvas;cursor:pointer}a{margin-left:16px;color:GrayText}</style></head>
<body><main><h1>Continue to ${esc(space.name)}?</h1><p>${esc(host)} will see your name, username and photo (${esc(me.name)}${me.handle ? ` · @${esc(me.handle)}` : ''}). It does not get your Frequency account or password.</p>
<form method="post" action="/auth/site-login"><input type="hidden" name="slug" value="${esc(space.slug)}"><input type="hidden" name="next" value="${esc(next)}"><button type="submit">Continue</button><a href="${esc(base)}${next === '/' ? '/' : esc(next)}">Cancel</a></form></main></body></html>`
  return new NextResponse(html, { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "frame-ancestors 'none'; default-src 'none'; style-src 'unsafe-inline'; form-action 'self'", 'X-Frame-Options': 'DENY' } })
}

export async function POST(req: Request) {
  // Only the confirm page above may mint: a form on any other origin is refused.
  const from = req.headers.get('origin')
  if (!from || (from !== appOrigin() && from !== new URL(req.url).origin)) return new NextResponse('Forbidden', { status: 403 })
  const form = await req.formData()
  const found = await resolve(String(form.get('slug') ?? ''), String(form.get('next') ?? ''))
  if (!found) return new NextResponse('Not found', { status: 404 })
  const { origin, space, next, base, host } = found
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(`/auth/site-login?slug=${encodeURIComponent(space.slug)}&next=${encodeURIComponent(next)}`)}`, origin), 303)
  const landing = `${base}${next === '/' ? '/' : next}`
  if (!host) return NextResponse.redirect(landing, 303)
  const me = await ownProfile(profileId)
  const token = signVisitorHandoff(host, { profileId, name: me.name, handle: me.handle, avatarUrl: me.avatarUrl })
  const res = NextResponse.redirect(token ? `${base}/_s/enter?t=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}` : landing, 303)
  for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v)
  return res
}

// THE WEBSITE ADMIN PASS (LIVE-864, owner ruling 2026-10-07: "Those are Admin display pages on the site").
// A Space website's Executive Overview and Yearly Calendar live ON the website, at /admin/overview and
// /admin/calendar, but a website cannot see who is signed in to Frequency: it is served on its own host,
// and Frequency's session cookie never reaches it. So the door is a handoff. Frequency's console checks the
// caller is one of the Space's managers and mints this pass; the website's /admin/enter route checks it and
// keeps it in a host-only cookie; each admin page checks the cookie again and re-checks the person's role.
//
// The pass is an HMAC-signed envelope: the Space id, the site host it was minted for, the person, whether
// they came in as platform staff (read-only preview, no membership to re-check), and its age. A pass minted
// for one site never opens another (the host and the Space both have to match), and it expires.
//
// PURE except for reading the signing secret from env at call time, so it is unit-testable alone.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** How long a pass, and the cookie holding it, lasts. A working session; a removed manager loses access at
 *  the next page view anyway, because every view re-checks the role. */
export const SITE_ADMIN_PASS_MAX_AGE_S = 12 * 60 * 60
const CLOCK_SKEW_MS = 60 * 1000
/** Keeps a pass minted here from verifying anywhere else that shares the secret. */
const PURPOSE = 'site-admin-pass'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOST = /^[a-z0-9.-]{1,253}$/

/** The cookie the website keeps the pass in: host-only, so one site's pass never rides to another. */
export const SITE_ADMIN_COOKIE = '__Host-site-admin'

/** The admin pages a website serves. */
const SITE_ADMIN_VIEWS = ['overview', 'calendar', 'editor'] as const
type SiteAdminView = (typeof SITE_ADMIN_VIEWS)[number]

export function siteAdminView(raw: string | null | undefined): SiteAdminView | null {
  return (SITE_ADMIN_VIEWS as readonly string[]).includes(raw ?? '') ? (raw as SiteAdminView) : null
}

interface SiteAdminPass {
  spaceId: string
  host: string
  profileId: string
  /** Platform staff previewing a Space they do not manage: read-only, nothing to re-check. */
  staff: boolean
}

interface PassPayload {
  s: string
  h: string
  p: string
  st: 0 | 1
  iat: number
  n: string
}

function secret(): string {
  return (
    process.env.SITE_ADMIN_PASS_SECRET?.trim() ||
    process.env.OAUTH_STATE_SECRET?.trim() ||
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  )
}

function mac(key: string, body: string): string {
  return createHmac('sha256', key).update(`${PURPOSE}.${body}`).digest('base64url')
}

/** Mint a pass, or null when there is no secret or an input is malformed. */
export function signSiteAdminPass(pass: SiteAdminPass, now: number = Date.now()): string | null {
  const key = secret()
  const host = pass.host.toLowerCase()
  if (!key || !UUID.test(pass.spaceId) || !UUID.test(pass.profileId) || !HOST.test(host)) return null
  const payload: PassPayload = {
    s: pass.spaceId,
    h: host,
    p: pass.profileId,
    st: pass.staff ? 1 : 0,
    iat: now,
    n: randomBytes(9).toString('base64url'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${mac(key, body)}`
}

/** Read a pass: what it grants, or null when it is missing, malformed, tampered with, from the future or
 *  expired. Constant-time compare; fails closed. The caller still checks the host and Space match. */
export function readSiteAdminPass(token: string | null | undefined, now: number = Date.now()): SiteAdminPass | null {
  const key = secret()
  if (!key || !token || typeof token !== 'string' || token.length > 2048) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const body = token.slice(0, dot)
  const a = Buffer.from(token.slice(dot + 1))
  const b = Buffer.from(mac(key, body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: PassPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PassPayload
  } catch {
    return null
  }
  if (!payload || typeof payload.iat !== 'number') return null
  if (typeof payload.s !== 'string' || !UUID.test(payload.s)) return null
  if (typeof payload.p !== 'string' || !UUID.test(payload.p)) return null
  if (typeof payload.h !== 'string' || !HOST.test(payload.h)) return null
  if (payload.iat > now + CLOCK_SKEW_MS || now - payload.iat > SITE_ADMIN_PASS_MAX_AGE_S * 1000) return null
  return { spaceId: payload.s, host: payload.h, profileId: payload.p, staff: payload.st === 1 }
}

/** Whether a read pass opens THIS site: minted for this host and this Space. */
export function passOpensSite(pass: SiteAdminPass | null, host: string, spaceId: string): pass is SiteAdminPass {
  return !!pass && pass.host === host.toLowerCase() && pass.spaceId === spaceId
}

/** The Frequency console address that mints a pass and sends the person back to `view` on the site. */
export function siteAdminHandoffPath(slug: string, view: SiteAdminView): string {
  return `/spaces/${encodeURIComponent(slug)}/manage/leadership/open?to=${view}`
}

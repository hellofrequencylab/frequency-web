// THE VISITOR'S SIGN-IN ON A SPACE WEBSITE (LIVE-1207). A website on its own domain cannot see who is signed
// in to Frequency: Frequency's session cookie is same-site and never reaches it, so the header's profile menu
// could only ever read "signed out". This is the handoff that fixes that, cut to the least it needs to.
//
//   1. The header's Log in goes to Frequency (/auth/site-login). Signed out, the person signs in there and
//      comes back; signed in, Frequency mints a HANDOFF token for the site's own host.
//   2. The site (/_s/enter) checks the token, and keeps a small signed DISPLAY cookie on its own host:
//      the person's name, handle and photo. Nothing else travels. No Frequency session, no refresh token,
//      no privilege: the cookie lets the header say who is here and nothing more. Every link in the menu
//      lands on Frequency, which asks for the real session itself.
//   3. The header reads /_s/me from the site, client-side. The cached page never reads a cookie.
//   4. Sign out on the site clears the cookie, then sends an EXIT token to Frequency (/auth/site-exit),
//      which signs the Frequency session out and returns to the site, so both sides end together.
//
// Every token is an HMAC-signed envelope bound to ONE site host, with its own purpose string, so a handoff
// cannot be replayed as a cookie or an exit, and a token for one site never opens another. The handoff and
// exit tokens live 60 seconds. PURE except for reading the signing secret at call time.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { sitePassSecret } from '@/lib/sites/site-admin-pass'

export const SITE_VISITOR_COOKIE = '__Host-site-visitor'
/** How long the display cookie lasts. It carries no authority, so this only bounds how stale a name or photo gets. */
export const SITE_VISITOR_MAX_AGE_S = 30 * 24 * 60 * 60
/** A handoff or exit token: long enough for one redirect, short enough to be worthless afterwards. */
const SITE_VISITOR_TOKEN_TTL_S = 60

const CLOCK_SKEW_MS = 30 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOST = /^[a-z0-9.-]{1,253}$/

type Purpose = 'site-visitor-handoff' | 'site-visitor-cookie' | 'site-visitor-exit'

interface SiteVisitor {
  profileId: string
  name: string
  handle: string | null
  avatarUrl: string | null
}

interface Envelope {
  h: string
  iat: number
  n: string
  v?: { p: string; nm: string; hd: string | null; av: string | null }
}

function mac(key: string, purpose: Purpose, body: string): string {
  return createHmac('sha256', key).update(`${purpose}.${body}`).digest('base64url')
}

function seal(purpose: Purpose, host: string, visitor: SiteVisitor | null, now: number): string | null {
  const key = sitePassSecret()
  const h = host.toLowerCase()
  if (!key || !HOST.test(h)) return null
  const envelope: Envelope = { h, iat: now, n: randomBytes(9).toString('base64url') }
  if (visitor) {
    if (!UUID.test(visitor.profileId)) return null
    envelope.v = { p: visitor.profileId, nm: visitor.name.slice(0, 80), hd: visitor.handle, av: visitor.avatarUrl }
  }
  const body = Buffer.from(JSON.stringify(envelope)).toString('base64url')
  return `${body}.${mac(key, purpose, body)}`
}

/** What a token says, or null when it is missing, malformed, tampered with, for another purpose or host,
 *  from the future or older than `maxAgeS`. Constant-time compare; fails closed. */
function open(purpose: Purpose, token: string | null | undefined, host: string, maxAgeS: number, now: number): Envelope | null {
  const key = sitePassSecret()
  if (!key || !token || typeof token !== 'string' || token.length > 2048) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const body = token.slice(0, dot)
  const a = Buffer.from(token.slice(dot + 1))
  const b = Buffer.from(mac(key, purpose, body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let envelope: Envelope
  try {
    envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Envelope
  } catch {
    return null
  }
  if (!envelope || typeof envelope.iat !== 'number' || typeof envelope.h !== 'string') return null
  if (envelope.h !== host.toLowerCase()) return null
  if (envelope.iat > now + CLOCK_SKEW_MS || now - envelope.iat > maxAgeS * 1000) return null
  return envelope
}

function visitorOf(envelope: Envelope): SiteVisitor | null {
  const v = envelope.v
  if (!v || typeof v.p !== 'string' || !UUID.test(v.p) || typeof v.nm !== 'string' || !v.nm.trim()) return null
  const avatar = typeof v.av === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(v.av) ? v.av : null
  const handle = typeof v.hd === 'string' && /^[a-z0-9_.-]{1,40}$/i.test(v.hd) ? v.hd : null
  return { profileId: v.p, name: v.nm.trim().slice(0, 80), handle, avatarUrl: avatar }
}

/** Frequency side: the one-use-in-spirit token that carries a signed-in person to `host`. */
export function signVisitorHandoff(host: string, visitor: SiteVisitor, now: number = Date.now()): string | null {
  return seal('site-visitor-handoff', host, visitor, now)
}

/** Site side: the person a handoff token names, only when it was minted for THIS host. */
export function readVisitorHandoff(token: string | null | undefined, host: string, now: number = Date.now()): SiteVisitor | null {
  const envelope = open('site-visitor-handoff', token, host, SITE_VISITOR_TOKEN_TTL_S, now)
  return envelope ? visitorOf(envelope) : null
}

/** The display cookie's value for a visitor on `host`. */
export function signVisitorCookie(host: string, visitor: SiteVisitor, now: number = Date.now()): string | null {
  return seal('site-visitor-cookie', host, visitor, now)
}

/** The visitor a display cookie names on `host`, or null (absent, tampered, other site, expired). */
export function readVisitorCookie(value: string | null | undefined, host: string, now: number = Date.now()): SiteVisitor | null {
  const envelope = open('site-visitor-cookie', value, host, SITE_VISITOR_MAX_AGE_S, now)
  return envelope ? visitorOf(envelope) : null
}

/** Site side: the token that lets Frequency end its session for a visitor who signed out of `host`. */
export function signVisitorExit(host: string, now: number = Date.now()): string | null {
  return seal('site-visitor-exit', host, null, now)
}

/** Frequency side: true only when an exit token was minted for `host` a moment ago. */
export function readVisitorExit(token: string | null | undefined, host: string, now: number = Date.now()): boolean {
  return open('site-visitor-exit', token, host, SITE_VISITOR_TOKEN_TTL_S, now) !== null
}

/** The only places a handoff may land the visitor: the site's Home or one of its single-segment pages. */
export function safeSitePath(raw: string | null | undefined): string {
  if (!raw) return '/'
  return /^\/(?:[a-z0-9][a-z0-9-]*)?$/.test(raw) ? raw : '/'
}

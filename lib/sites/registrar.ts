// THE VERCEL REGISTRAR CLIENT (LIVE-781). Search, price and buy a domain on Frequency's Vercel team, so
// a Space can buy a new domain inside Frequency and have its website on it with no DNS step (a domain
// bought on the team uses Vercel DNS). Server-only: it carries the platform Vercel token.
//
// CONFIG: the same three values as lib/sites/vercel-domains.ts (VERCEL_API_TOKEN, VERCEL_PROJECT_ID,
// VERCEL_TEAM_ID), read through vercelApiConfig(), so there is exactly one platform token.
//
// ENDPOINTS (Vercel REST, Domains Registrar):
//   GET  /v1/registrar/domains/{domain}/availability   -> { available }
//   GET  /v1/registrar/domains/{domain}/price?years=1   -> { years, purchasePrice, renewalPrice, transferPrice } (USD)
//   POST /v1/registrar/domains/{domain}/buy             -> { orderId }  (body: autoRenew, years, expectedPrice, contactInformation)
//   GET  /v1/registrar/orders/{orderId}                 -> { orderId, status: draft | purchasing | completed | failed, domains }
//
// THE REGISTRANT IS THE END CUSTOMER. contactInformation names the Space's person, so the domain is
// theirs (and Vercel gives an auth code if they ever move it). The fields below are the ones Vercel
// requires for every TLD; some TLDs ask for more (`additional`), and a buy that needs them fails with
// a typed error rather than a guess.
//
// NEVER THROWS INTO THE UI. Every call returns a typed result. Nothing here logs the token or the
// registrant's details; a failure logs the status and Vercel's error code only.

import { vercelApiConfig } from './vercel-domains'
import { usdToCents } from './domain-pricing'

const API = 'https://api.vercel.com'

type RegistrarError =
  | 'not-configured'
  | 'invalid-domain'
  | 'unsupported'
  | 'unavailable'
  | 'price-changed'
  | 'contact-invalid'
  | 'rate-limited'
  | 'upstream'
  | 'network'

type RegistrarResult<T> = { ok: true; data: T } | { ok: false; error: RegistrarError; code?: string }

interface DomainPrice {
  years: number
  /** First-year price at Vercel, in cents. */
  purchaseCents: number
  /** Yearly renewal at Vercel, in cents (null when Vercel gives none). */
  renewalCents: number | null
}

type DomainOrderStatus = 'draft' | 'purchasing' | 'completed' | 'failed' | 'unknown'

/** The registrant: the person the domain is registered to. Vercel's required fields. */
export interface RegistrantContact {
  firstName: string
  lastName: string
  email: string
  /** E.164, like +14155550123. */
  phone: string
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  /** ISO 3166-1 alpha-2, like US. */
  country: string
  companyName?: string
}

/** Can the app reach the registrar at all? */
export function registrarConfigured(): boolean {
  return vercelApiConfig() !== null
}

type Fetcher = typeof fetch

async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  fetcher: Fetcher = fetch,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> } | { network: true } | null> {
  const cfg = vercelApiConfig()
  if (!cfg) return null
  const sep = path.includes('?') ? '&' : '?'
  try {
    const res = await fetcher(`${API}${path}${sep}teamId=${encodeURIComponent(cfg.teamId)}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    let json: Record<string, unknown> = {}
    try {
      const parsed: unknown = await res.json()
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Record<string, unknown>
    } catch {
      // No body is fine; the status still says what happened.
    }
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { network: true }
  }
}

function errorCode(json: Record<string, unknown>): string {
  const err = json.error as { code?: unknown } | undefined
  return typeof err?.code === 'string' ? err.code : ''
}

/** Map a failed Vercel response to the small set of errors the app acts on. Exported for the tests. */
export function classifyFailure(status: number, code: string): RegistrarError {
  const c = code.toLowerCase()
  if (status === 429) return 'rate-limited'
  if (c.includes('price')) return 'price-changed'
  if (c.includes('contact') || c.includes('registrant')) return 'contact-invalid'
  if (c.includes('not_available') || c.includes('unavailable') || c.includes('taken') || status === 409) return 'unavailable'
  if (c.includes('tld') || c.includes('unsupported') || c.includes('premium')) return 'unsupported'
  if (status === 400 && c.includes('domain')) return 'invalid-domain'
  return 'upstream'
}

type Raw = Awaited<ReturnType<typeof call>>

function failed<T>(res: Raw, label: string): RegistrarResult<T> {
  if (res === null) return { ok: false, error: 'not-configured' }
  if ('network' in res) {
    console.error(`[registrar] ${label}: Vercel unreachable`)
    return { ok: false, error: 'network' }
  }
  const code = errorCode(res.json)
  console.error(`[registrar] ${label}: Vercel ${res.status}${code ? ` ${code}` : ''}`)
  return { ok: false, error: classifyFailure(res.status, code), code: code || undefined }
}

const enc = encodeURIComponent

/** Is `domain` free to register? */
export async function getDomainAvailability(domain: string, fetcher?: Fetcher): Promise<RegistrarResult<{ available: boolean }>> {
  const res = await call('GET', `/v1/registrar/domains/${enc(domain)}/availability`, undefined, fetcher)
  if (!res || 'network' in res || !res.ok) return failed(res, 'availability')
  if (typeof res.json.available !== 'boolean') return { ok: false, error: 'upstream' }
  return { ok: true, data: { available: res.json.available } }
}

/** Vercel's price for one year of `domain`. A TLD whose minimum term is longer than a year is
 *  `unsupported`, because Frequency shows one yearly price. */
export async function getDomainPrice(domain: string, fetcher?: Fetcher): Promise<RegistrarResult<DomainPrice>> {
  const res = await call('GET', `/v1/registrar/domains/${enc(domain)}/price?years=1`, undefined, fetcher)
  if (!res || 'network' in res || !res.ok) return failed(res, 'price')
  const years = Number(res.json.years ?? 1)
  const purchaseCents = usdToCents(res.json.purchasePrice)
  if (purchaseCents === null) return { ok: false, error: 'upstream' }
  if (years !== 1) return { ok: false, error: 'unsupported' }
  return { ok: true, data: { years, purchaseCents, renewalCents: usdToCents(res.json.renewalPrice) } }
}

/**
 * Buy `domain` for one year. `expectedPriceCents` is the Vercel price the Space was charged against:
 * Vercel refuses the order when its price has moved, so Frequency never buys at a price it did not
 * quote. Call ONLY after Stripe has confirmed payment, and only from the claimed purchase row
 * (lib/sites/domain-purchase.ts), which is what makes a retried webhook unable to buy twice.
 */
export async function buyDomain(
  domain: string,
  opts: { expectedPriceCents: number; autoRenew: boolean; contact: RegistrantContact },
  fetcher?: Fetcher,
): Promise<RegistrarResult<{ orderId: string }>> {
  const contact = cleanContact(opts.contact)
  const body = {
    autoRenew: opts.autoRenew,
    years: 1,
    expectedPrice: Math.round(opts.expectedPriceCents) / 100,
    contactInformation: contact,
  }
  const res = await call('POST', `/v1/registrar/domains/${enc(domain)}/buy`, body, fetcher)
  if (!res || 'network' in res || !res.ok) return failed(res, 'buy')
  const orderId = res.json.orderId
  if (typeof orderId !== 'string' || !orderId) return { ok: false, error: 'upstream' }
  return { ok: true, data: { orderId } }
}

/** Where an order stands. Registration is asynchronous: `purchasing` becomes `completed` or `failed`. */
export async function getDomainOrder(orderId: string, fetcher?: Fetcher): Promise<RegistrarResult<{ status: DomainOrderStatus }>> {
  const res = await call('GET', `/v1/registrar/orders/${enc(orderId)}`, undefined, fetcher)
  if (!res || 'network' in res || !res.ok) return failed(res, 'order')
  const s = res.json.status
  const status: DomainOrderStatus =
    s === 'draft' || s === 'purchasing' || s === 'completed' || s === 'failed' ? s : 'unknown'
  return { ok: true, data: { status } }
}

// ── The registrant form ─────────────────────────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{7,14}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Trim the optional fields away when empty: Vercel rejects an empty string for any field it takes. */
function cleanContact(c: RegistrantContact): RegistrantContact {
  const out: RegistrantContact = { ...c }
  if (!out.address2) delete out.address2
  if (!out.companyName) delete out.companyName
  return out
}

/**
 * Read the registrant fields a Space owner typed into the buy form. Returns the cleaned contact, or the
 * first plain-English problem to show. PURE. A phone typed with spaces or dashes is normalised to E.164.
 */
export function parseRegistrantContact(input: unknown): { ok: true; contact: RegistrantContact } | { ok: false; error: string } {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const contact: RegistrantContact = {
    firstName: text(r.firstName, 100),
    lastName: text(r.lastName, 100),
    email: text(r.email, 254).toLowerCase(),
    phone: text(r.phone, 32).replace(/[\s().-]/g, ''),
    address1: text(r.address1),
    address2: text(r.address2),
    city: text(r.city, 100),
    state: text(r.state, 100),
    zip: text(r.zip, 20),
    country: text(r.country, 10).toUpperCase(),
    companyName: text(r.companyName),
  }
  if (!contact.firstName || !contact.lastName) return { ok: false, error: 'Add the first and last name the domain is registered to.' }
  if (!EMAIL.test(contact.email)) return { ok: false, error: 'Add an email address that works. The registry checks it.' }
  if (!E164.test(contact.phone)) return { ok: false, error: 'Add a phone number with its country code, like +1 415 555 0123.' }
  if (!contact.address1 || !contact.city || !contact.state || !contact.zip) return { ok: false, error: 'Add the full mailing address.' }
  if (!/^[A-Z]{2}$/.test(contact.country)) return { ok: false, error: 'Add the two letter country code, like US.' }
  return { ok: true, contact: cleanContact(contact) }
}

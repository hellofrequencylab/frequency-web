// The conversational From header, built ONE way (scan2 L3-01 + L3-02, 2026-09-05).
//
// Six builders (the CRM reply, the leader reply, the leader fan-out, the Space compose, the email
// bridge, the batch flush default) each did `addr = EMAIL_CONVERSATION_FROM ?? EMAIL_FROM ?? default`
// and then `"<Name> via Frequency <" + addr + ">"`. EMAIL_FROM's documented and default form is
// `Frequency <noreply@send.frequencylocal.com>`, so whenever EMAIL_CONVERSATION_FROM was unset the
// result was `Ada via Frequency <Frequency <noreply@...>>`: nested angle brackets, RFC 5322-invalid,
// rejected by the provider, so the reply was recorded on the thread and never reached anyone. And a
// BLANK EMAIL_CONVERSATION_FROM (the `.env.example` shape) is not nullish, so `??` kept it and the
// header read `Ada via Frequency <>`. Two siblings (lib/spaces/email.ts spaceFromLine and
// lib/email-studio/send.ts buildCampaignFrom) already extracted the address correctly; this module is
// that shape, shared, with the display name quoted per RFC 5322 when it needs to be.
//
// PURE apart from reading process.env at call time. No IO.

import { envStringOrNull } from '@/lib/env/string'

/** The last-resort conversational address when neither env var is set. A separate subdomain from
 *  the bulk/noreply identity so 1:1 mail never rides bulk reputation (ADR-812). */
export const DEFAULT_CONVERSATION_ADDRESS = 'people@people.frequencylocal.com'

/** The bare address inside a From header that may be `Name <addr>` or just `addr`. Linear indexOf,
 *  not a regex (ReDoS-safe on env input). Any stray angle bracket is dropped from the result so the
 *  caller can wrap it in `< >` without ever nesting. */
export function addressOf(header: string): string {
  const s = (header ?? '').trim()
  const lt = s.indexOf('<')
  let inner = s
  if (lt >= 0) {
    const gt = s.indexOf('>', lt + 1)
    inner = gt > lt ? s.slice(lt + 1, gt) : s.slice(lt + 1)
  }
  return inner.replace(/[<>\s]/g, '')
}

/** The verified conversational ADDRESS: EMAIL_CONVERSATION_FROM when set (either form), else the
 *  address inside EMAIL_FROM (either form), else the default. Blank counts as unset. */
export function conversationAddress(): string {
  const configured = envStringOrNull('EMAIL_CONVERSATION_FROM') ?? envStringOrNull('EMAIL_FROM')
  const addr = configured ? addressOf(configured) : ''
  return addr || DEFAULT_CONVERSATION_ADDRESS
}

// RFC 5322 `atext` plus space: a display name made only of these is a bare phrase and needs no
// quoting. Anything else (a comma, a period, a colon, non-ASCII) becomes a quoted-string.
const BARE_PHRASE = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]+$/

/** The cleaned raw phrase behind a display name: control characters and angle brackets removed (so it
 *  can never break the header or look like an address), whitespace collapsed, capped so the whole From
 *  stays within the line length. '' when nothing usable remains. Pure. */
function cleanPhrase(name: string): string {
  return (name ?? '')
    .replace(/[\x00-\x1F\x7F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 78)
}

/** Quote a cleaned phrase the way RFC 5322 needs: bare when it is atext-only, otherwise a
 *  quoted-string with `"` and `\` escaped. Pure. */
function quotePhrase(phrase: string): string {
  if (BARE_PHRASE.test(phrase)) return phrase
  return `"${phrase.replace(/["\\]/g, '\\$&')}"`
}

/** An RFC 5322 display-name for `name`: cleaned (cleanPhrase) and quoted only when it needs to be.
 *  '' for an unusable name. Pure. */
export function formatDisplayName(name: string): string {
  const clean = cleanPhrase(name)
  return clean ? quotePhrase(clean) : ''
}

/**
 * The conversational From line for a sender shown as `displayName`.
 *   conversationFrom('Ada')                → `Ada via Frequency <people@people.frequencylocal.com>`
 *   conversationFrom('Lovelace, Ada')      → `"Lovelace, Ada via Frequency" <people@...>`
 *   conversationFrom(null)                 → `Frequency <people@...>`
 *   conversationFrom('Riverside', { via: false }) → `Riverside <people@...>` (a brand, not a person)
 * The address comes from conversationAddress(); the display name is quoted when RFC 5322 needs it and
 * the address is never nested inside another `< >`.
 */
export function conversationFrom(displayName: string | null | undefined, options: { via?: boolean } = {}): string {
  const via = options.via ?? true
  const raw = cleanPhrase(displayName ?? '')
  const addr = conversationAddress()
  if (!raw) return `Frequency <${addr}>`
  // A bare "Frequency" sender must not read "Frequency via Frequency".
  const label = via && raw.toLowerCase() !== 'frequency' ? `${raw} via Frequency` : raw
  return `${quotePhrase(label)} <${addr}>`
}

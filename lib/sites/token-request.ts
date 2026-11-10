// THE TOKEN-REQUEST PATH (PROG-E10, ADR-976 D-1): nobody writes raw CSS, so a Space that needs a look
// the theme tokens do not carry asks for a token instead. The request is plain words (which token, what
// it should do, why), never a style value or a stylesheet. It lands as a support ticket (type `idea`),
// which is the queue staff already work (O-4's owner and SLA are settled in docs/EDITOR-ARCHITECTURE.md
// before the first paid Site). Dark: off until SITE_TOKEN_REQUESTS_ENABLED is on (docs/RUNBOOKS.md).
import { envFlag } from '@/lib/env/string'

export const TOKEN_REQUESTS_FLAG = 'SITE_TOKEN_REQUESTS_ENABLED'

export function tokenRequestsEnabled(): boolean {
  return envFlag(TOKEN_REQUESTS_FLAG)
}

export interface ThemeTokenRequestInput {
  /** The token the Space wants, as a name: `--th-accent-soft`, or plain words ("a softer accent"). */
  token: string
  /** What it should do, in words. */
  want: string
  /** Why the existing tokens do not cover it. Optional. */
  why?: string
}

export type TokenRequestCheck = { ok: true; request: Required<ThemeTokenRequestInput> } | { ok: false; error: string }

const MAX_TOKEN = 80
const MAX_WANT = 600
const MAX_WHY = 600

// Anything that reads as authored CSS or markup. The request is prose; a stylesheet pasted into it is
// the D-1 decision leaking back in through a text box, so it is refused with a plain reason.
const CSS_SHAPE = /[{};<>]|\burl\s*\(|\bexpression\s*\(|@import|\/\*|\*\/|!important|\bjavascript:/i

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/** Validate a token request. Pure: no flag, no database. */
export function checkTokenRequest(input: Partial<Record<keyof ThemeTokenRequestInput, unknown>>): TokenRequestCheck {
  const token = clean(input.token)
  const want = clean(input.want)
  const why = clean(input.why)
  if (!token) return { ok: false, error: 'Name the token you need, for example --th-accent-soft, or describe it in a few words.' }
  if (!want) return { ok: false, error: 'Say what the token should do.' }
  if (token.length > MAX_TOKEN) return { ok: false, error: `Keep the token name under ${MAX_TOKEN} characters.` }
  if (want.length > MAX_WANT || why.length > MAX_WHY) return { ok: false, error: `Keep each answer under ${MAX_WANT} characters.` }
  if (CSS_SHAPE.test(token) || CSS_SHAPE.test(want) || CSS_SHAPE.test(why)) {
    return { ok: false, error: 'Describe the look in words. Sites do not take CSS; the team adds a token for it instead.' }
  }
  return { ok: true, request: { token, want, why } }
}

export interface TokenRequestDeps {
  /** Files the ticket. The default is lib/support/store createTicket, loaded lazily so tests need no database. */
  createTicket: (input: {
    profileId: string
    type: 'idea'
    subject: string
    body: string
    pageUrl: string | null
  }) => Promise<{ id: string; ref: number }>
}

export type TokenRequestResult = { ok: true; ref: number } | { ok: false; error: string }

/** The one entry point. Off returns a calm refusal; a bad request returns its reason; a good one files a ticket. */
export async function requestThemeTokens(
  args: { profileId: string; spaceId: string; spaceName: string; theme: string; requests: Partial<Record<keyof ThemeTokenRequestInput, unknown>>[] },
  deps?: TokenRequestDeps,
): Promise<TokenRequestResult> {
  if (!tokenRequestsEnabled()) return { ok: false, error: 'Token requests are not open yet.' }
  if (args.requests.length === 0 || args.requests.length > 5) return { ok: false, error: 'Send between one and five token requests at a time.' }
  const checked: Required<ThemeTokenRequestInput>[] = []
  for (const r of args.requests) {
    const c = checkTokenRequest(r)
    if (!c.ok) return c
    checked.push(c.request)
  }
  const body = [
    `Space: ${args.spaceName} (${args.spaceId})`,
    `Theme: ${args.theme}`,
    '',
    ...checked.map((r, i) => `${i + 1}. ${r.token}\n   Wants: ${r.want}${r.why ? `\n   Why: ${r.why}` : ''}`),
  ].join('\n')
  const create = deps?.createTicket ?? (await import('@/lib/support/store')).createTicket
  try {
    const t = await create({
      profileId: args.profileId,
      type: 'idea',
      subject: `Theme token request: ${args.spaceName}`,
      body,
      pageUrl: null,
    })
    return { ok: true, ref: t.ref }
  } catch {
    return { ok: false, error: 'Could not send the request. Try again in a moment.' }
  }
}

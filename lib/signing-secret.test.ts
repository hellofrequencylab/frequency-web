import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { signingSecret } from './signing-secret'

// The property under test is a NEGATIVE one: in production this must never fall back to the
// service-role key. Four of the eight signing modules enforced that and four did not, so the
// regression this locks is not hypothetical — it is the state the repo was in.

const ENV_KEYS = [
  'NODE_ENV',
  'SUPABASE_SERVICE_ROLE_KEY',
  'A_SECRET',
  'B_SECRET',
  'C_SECRET',
] as const
const saved = new Map<string, string | undefined>()

function setEnv(patch: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) if (!saved.has(k)) saved.set(k, process.env[k])
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else (process.env as Record<string, string>)[k] = v
  }
}

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else (process.env as Record<string, string>)[k] = v
  }
  saved.clear()
})

describe('signingSecret', () => {
  it('returns the first non-empty env var in the chain', () => {
    setEnv({ A_SECRET: undefined, B_SECRET: 'from-b', C_SECRET: 'from-c' })
    expect(signingSecret('t', ['A_SECRET', 'B_SECRET', 'C_SECRET'])).toBe('from-b')
  })

  it('treats an empty string as unset, so a blank var never signs anything', () => {
    setEnv({ A_SECRET: '', B_SECRET: 'from-b' })
    expect(signingSecret('t', ['A_SECRET', 'B_SECRET'])).toBe('from-b')
  })

  it('REFUSES the service-role fallback in production, even when the key is available', () => {
    // The whole point. A soft-degrade here couples every issued link to the service-role key,
    // so rotating it silently invalidates all of them, and widens that key's blast radius from
    // "server-side data access" to "anyone who can forge a link".
    setEnv({ NODE_ENV: 'production', A_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-material-here' })
    expect(() => signingSecret('paid-thing', ['A_SECRET'])).toThrow(/must be set in production/)
    expect(() => signingSecret('paid-thing', ['A_SECRET'])).toThrow(/Refusing to sign with the service-role key/)
  })

  it('names every accepted var in the production error, so the fix is in the message', () => {
    setEnv({ NODE_ENV: 'production', A_SECRET: undefined, B_SECRET: undefined })
    expect(() => signingSecret('t', ['A_SECRET', 'B_SECRET'])).toThrow(/A_SECRET \/ B_SECRET/)
  })

  it('falls back outside production, so dev and CI can sign without a provisioned secret', () => {
    setEnv({ NODE_ENV: 'test', A_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(64) })
    expect(signingSecret('t', ['A_SECRET'])).toBe('x'.repeat(32))
  })

  it('throws outside production when there is nothing to sign with at all', () => {
    setEnv({ NODE_ENV: 'test', A_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined })
    expect(() => signingSecret('t', ['A_SECRET'])).toThrow(/cannot sign/)
  })
})

describe('every signing module routes through the shared helper', () => {
  // Eight modules had written this by hand and drifted into two behaviours. The guard against
  // that recurring is not "remember to add the production branch" — it is that there is only one
  // branch to add. A module that reintroduces its own getSecret fails here.
  const MODULES = [
    'lib/unsubscribe-tokens.ts',
    'lib/comms/chat-token.ts',
    'lib/comms/reply-address.ts',
    'lib/spaces/email-tracking.ts',
    'lib/crm/lead-links.ts',
    'lib/crm/optin/tokens.ts',
    'lib/qr/event-invite.ts',
    'lib/connections/lead-unsub.ts',
  ]

  for (const path of MODULES) {
    it(`${path} imports signingSecret and hand-rolls no fallback of its own`, () => {
      const src = readFileSync(path, 'utf8')
      expect(src).toContain("from '@/lib/signing-secret'")
      // The tell of a re-inlined copy: reading the service-role key for signing material.
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*\?\.\s*slice/)
    })
  }
})

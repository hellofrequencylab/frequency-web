import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SIGN_IN_ERRORS, SIGN_IN_ERROR_FALLBACK, signInErrorMessage } from './errors'

// LIVE-043 — the three defects on the front door, pinned so they cannot come back.
//
// The behavioural half (the error vocabulary) is tested by CALLING it. The wiring half is tested
// by reading the source, because a Server Action that awaits `next/headers` and Supabase cannot be
// invoked in a unit test without mocking away the very thing under test. Those assertions are
// written to name the DEFECT — the raw render, the un-throttled call, the plain `<button>` — so
// they fail on the mistake returning rather than on the fix being rephrased.

const read = (p: string) => readFileSync(p, 'utf8')
const PAGE = 'app/sign-in/page.tsx'
const ACTIONS = 'app/sign-in/actions.ts'
const CALLBACK = 'app/auth/callback/route.ts'

describe('the sign-in error box shows OUR words', () => {
  it('refuses text that did not come from the table, which is the injection', () => {
    // The live shape: anyone could send this link and the product rendered the sentence, in the
    // product's own error styling, on the product's own sign-in page.
    const attack = 'Your account is locked. Call 555-0100 to restore it.'
    expect(signInErrorMessage(attack)).toBe(SIGN_IN_ERROR_FALLBACK)
    expect(signInErrorMessage(attack)).not.toContain('555-0100')
    // A vendor string is refused by the same rule, which is the other half of why this exists.
    expect(signInErrorMessage('AuthApiError: Email rate limit exceeded')).toBe(SIGN_IN_ERROR_FALLBACK)
  })

  it('still says SOMETHING for an unknown code — a real failure must never render silently', () => {
    expect(signInErrorMessage('a-code-we-never-shipped')).toBe(SIGN_IN_ERROR_FALLBACK)
    expect(signInErrorMessage(SIGN_IN_ERROR_FALLBACK)).toBeTruthy()
  })

  it('renders nothing when there is no error, so the box does not appear on a clean load', () => {
    expect(signInErrorMessage(null)).toBeNull()
    expect(signInErrorMessage(undefined)).toBeNull()
    expect(signInErrorMessage('')).toBeNull()
    expect(signInErrorMessage('   ')).toBeNull()
  })

  it.each(Object.keys(SIGN_IN_ERRORS))('code %s resolves to its own sentence', (code) => {
    const msg = signInErrorMessage(code)
    expect(msg).toBe(SIGN_IN_ERRORS[code as keyof typeof SIGN_IN_ERRORS])
    expect(msg).not.toBe(SIGN_IN_ERROR_FALLBACK)
  })

  it('every sentence obeys the voice canon: no em dash, no vendor noise, ends in a stop', () => {
    for (const msg of [...Object.values(SIGN_IN_ERRORS), SIGN_IN_ERROR_FALLBACK]) {
      expect(msg).not.toMatch(/—/) // docs/CONTENT-VOICE.md: no em dashes in brand copy
      expect(msg).not.toMatch(/AuthApiError|Supabase|OAuth failed|undefined|null/)
      expect(msg).toMatch(/[.!]$/)
    }
  })

  it('nobody redirects a raw message onto the form any more', () => {
    for (const file of [ACTIONS, CALLBACK]) {
      const src = read(file)
      // The exact shape that shipped the vendor string: `?error=${encodeURIComponent(...)}`.
      expect(src, `${file} still builds a sign-in error out of free text`).not.toMatch(
        /sign-in\?error=\$\{encodeURIComponent/,
      )
    }
    expect(read(PAGE), 'the page still renders the query string directly').not.toContain(
      'decodeURIComponent(error)',
    )
  })
})

describe('the front door is throttled, and cannot be throttled into an outage', () => {
  const src = read(ACTIONS)

  it('both entry points call the limiter', () => {
    expect(src).toMatch(/rateLimitOk\(\s*'signin:ip'/)
    expect(src).toMatch(/rateLimitOk\(\s*'signin:email'/)
    expect(src).toMatch(/rateLimitOk\(\s*'signin:oauth'/)
  })

  it('every one of them opts OUT of fail-closed', () => {
    // 🔴 The load-bearing assertion. lib/rate-limit denies by default in production when Upstash
    // is absent, which on THIS endpoint means nobody signs in and nobody signs up. Any limiter
    // call added here later must carry the same opt-out, so the count is compared, not sampled.
    const calls = src.match(/rateLimitOk\(/g) ?? []
    const opted = src.match(/OPEN_WHEN_UNSET/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
    // One definition + one use per call.
    expect(opted.length).toBe(calls.length + 1)
    expect(src).toMatch(/whenUnconfigured:\s*'allow'/)
  })

  it('buckets the mailbox case-insensitively, or the per-address ceiling is free to double', () => {
    expect(src).toMatch(/toLowerCase\(\)/)
  })
})

describe('a second press cannot invalidate the first magic link', () => {
  const page = read(PAGE)

  it('both forms submit through the pending-aware button, not a bare <button>', () => {
    expect((page.match(/<SignInSubmit/g) ?? []).length).toBe(2)
    expect(page, 'a hand-rolled submit button is back on the sign-in form').not.toMatch(
      /<button\s+[^>]*type="submit"/,
    )
  })

  it('the button reports pending from the form it is inside', () => {
    const submit = read('app/sign-in/submit.tsx')
    expect(submit).toMatch(/^'use client'/)
    expect(submit).toContain('useFormStatus')
    // INTERACTION-STATES §4 rule 4 (disable = re-entrancy guard) via Button's `loading`, which
    // also leaves the label alone (§4 rule 3, no width change).
    expect(submit).toMatch(/loading=\{pending\}/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FUNNELS } from '@/lib/funnels/definitions'

// ── A FUNNEL SIGNUP MUST SURVIVE THE BROWSER IT WAS NOT STARTED IN ──────────────────────────────
//
// 🔴 THE BUG (owner, 2026-08-31, off a phone capture of the live funnel). The beta page runs in
// INSTAGRAM'S IN-APP BROWSER — the capture shows its chrome. That webview has its own cookie jar.
// So the flow was:
//
//   1. email submitted inside the Instagram webview -> `fq_post_login` set in ITS jar
//   2. emailed magic link opened in Mail/Safari    -> a DIFFERENT jar, cookie absent
//   3. app/auth/callback: no cookie, no ?next      -> defaults to /feed
//   4. (main)/layout: not onboarded                -> /onboarding
//   5. /onboarding: FUNNEL_INDUCTION_ACTIVE        -> /join   (no ?seq)
//   6. /join: no seq                               -> the GENERIC Circles induction
//
// Someone who asked for a breathwork timer got a wizard about starting a local Circle. For this
// traffic source that is not an edge case, it is the normal path.
//
// The cookie design is deliberate and is NOT changed here: app/sign-in/actions.ts keeps
// `emailRedirectTo` bare so the provider's redirect-allowlist match is untouched. What is added is
// a second carrier that a change of browser cannot lose — the funnel slug on the AUTH USER — read
// back through the same map that wrote it.

const signIn = readFileSync('app/sign-in/actions.ts', 'utf8')
const callback = readFileSync('app/auth/callback/route.ts', 'utf8')
const funnel = readFileSync('app/join/(induction)/feature-funnel.tsx', 'utf8')
const proxy = readFileSync('proxy.ts', 'utf8')

describe('the funnel slug rides on the auth user, not only in a cookie', () => {
  it('the funnel sends its own slug with the magic-link request', () => {
    expect(funnel).toContain("fd.set('seq', sequence)")
  })

  it('sign-in stamps it as Supabase user metadata', () => {
    expect(signIn).toContain('funnel_seq')
    expect(signIn).toContain('data: { funnel_seq: seq }')
  })

  it('🔴 and emailRedirectTo STAYS BARE — the allowlist decision is not reversed', () => {
    // The alternative fix (putting ?next= on the callback URL) depends on the provider's Redirect
    // URL allowlist, and on a miss some Supabase versions silently fall back to the Site URL —
    // which would land people on the homepage and be WORSE than the bug. This file's approach
    // costs the allowlist nothing, and this assertion is what stops it drifting into that.
    expect(signIn).toContain('emailRedirectTo: await getCallbackUrl()')
    const code = signIn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/getCallbackUrl\([^)]*next/)
  })
})

describe('the slug is validated against the code funnels before it becomes a path', () => {
  it('sign-in narrows it through the FUNNELS map, not a regex', () => {
    expect(signIn).toContain("import { FUNNELS } from '@/lib/funnels/definitions'")
    expect(signIn).toContain('hasOwnProperty.call(FUNNELS, v)')
  })

  it('🔴 the callback re-validates rather than trusting the metadata it reads', () => {
    // user_metadata is user-influenceable in the general case. If the callback interpolated it
    // into a path unchecked, this would be an open redirect on the login path — the one place in
    // the app where that is worst.
    expect(callback).toContain('hasOwnProperty.call(FUNNELS, seq)')
    expect(callback).toContain('/join?seq=${encodeURIComponent(seq)}')
  })

  it('and the map it validates against actually contains the funnel this was built for', () => {
    // A negative control on the whole mechanism: if `breathwork` ever leaves FUNNELS, the recovery
    // silently stops recovering, and both assertions above would still pass.
    expect(Object.keys(FUNNELS)).toContain('breathwork')
  })
})

describe('precedence: a recovery never overrules something actually asked for', () => {
  it('both recoveries sit behind hasExplicitNext', () => {
    expect(callback).toContain('!hasExplicitNext && recovered')
  })

  it('a claimed seat wins over a funnel, because a seat can be happening right now', () => {
    expect(callback).toContain('const recovered = seatLanding ?? funnelLanding')
  })
})

describe('the timer keeps its own destination through a sign-in', () => {
  it('/on-air is a protected path, so the proxy builds next= for it (LIVE-136)', () => {
    // Without this the page's own bare `redirect('/sign-in')` fires instead, and a signed-out tap
    // on the PWA "Mindless" shortcut or a "Time to practice" push signs in and lands on /feed.
    const list = proxy.match(/PROTECTED_PATHS[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(list).toContain("'/on-air'")
  })
})

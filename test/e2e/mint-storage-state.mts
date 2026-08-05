#!/usr/bin/env node
// MINT A MEMBER SESSION FOR PLAYWRIGHT — the `PW_STORAGE_STATE` file, made on demand.
//
//   pnpm e2e:session                      # writes test/e2e/.auth/member.json
//   pnpm e2e:session -- --out /tmp/x.json # or anywhere else
//
// ── WHY THIS EXISTS AND WHY IT LOOKS LIKE THIS ─────────────────────────────────────────
// Sign-in is magic-link only (app/sign-in/actions.ts → `signInWithOtp`), so there is no
// password to script and no form a headless browser can complete on its own. Every honest
// option was considered, and only one survives contact with CI:
//
//   1. A HUMAN SIGNS IN ONCE and exports `context.storageState()`. Works locally, and is a
//      dead end for the PR gate for two independent reasons. (a) Supabase auth cookies are
//      DOMAIN-SCOPED, and every pull request gets its own `*.vercel.app` preview hostname,
//      so a file exported against production is simply not sent to the deployment under
//      test — the suite would land on /sign-in. (b) Refresh tokens ROTATE: the first run
//      that refreshes invalidates the stored one, so a static secret is good for roughly one
//      access-token lifetime and then quietly stops working. Both failures look identical to
//      "no credential", which is the silence this whole change is about.
//   2. MINT A SESSION PER RUN with the service-role key. This is what the product itself
//      already does: `app/(main)/impersonate-actions.ts` calls
//      `admin.auth.admin.generateLink({ type: 'magiclink' })` (which sends NO email) and
//      exchanges the returned `hashed_token` through `verifyOtp`. Same two calls here. The
//      session is minted fresh, for the exact host under test, and expires on its own.
//
// So: option 2 in CI and for anything repeatable, option 1 only as a local convenience
// (see test/e2e/README.md § The member shell for the by-hand path).
//
// ── HOW THE COOKIES ARE PRODUCED, AND WHY NOT BY HAND ──────────────────────────────────
// The app reads its session through `@supabase/ssr`, which owns the cookie NAME, the
// base64url encoding and the >3180-byte chunking. Hand-rolling that here would be a second
// implementation of a private format, drifting silently the first time the library changes.
// Instead we hand `createServerClient` a cookie jar of our own and let IT write: the
// `setAll` callback receives exactly the cookies the app's own server client would have set,
// for the version of `@supabase/ssr` this repo has installed. Same idiom as lib/supabase/
// server.ts, with an array standing in for `next/headers`.
//
// ── WHAT IT NEEDS ──────────────────────────────────────────────────────────────────────
//   PW_BASE_URL                     the deployment the session is FOR (sets the cookie domain)
//   NEXT_PUBLIC_SUPABASE_URL        project URL
//   SUPABASE_SERVICE_ROLE_KEY       to mint the link (never leaves the runner / your shell)
//   PW_MEMBER_EMAIL                 the e2e member account's email (the account must exist)
//   NEXT_PUBLIC_SUPABASE_ANON_KEY   optional; the service-role key is used if absent
//   VERCEL_AUTOMATION_BYPASS_SECRET optional; needed to VERIFY against a protected preview
//
// It verifies before it writes anything useful: the minted cookies are replayed against
// PW_BASE_URL/feed, and landing on /sign-in is a hard failure. A storage-state file that
// does not actually authenticate is worse than none, because the suite would photograph the
// sign-in page under the shell's name.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

interface JarCookie {
  name: string
  value: string
  options?: CookieOptions
}

interface PlaywrightCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}

function fail(message: string, ...detail: string[]): never {
  console.error(`\n🔴 ${message}`)
  for (const line of detail) console.error(`   ${line}`)
  console.error('')
  process.exit(1)
}

function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`))
  return inline ? inline.slice(flag.length + 1) : undefined
}

const baseUrlRaw =
  env('PW_BASE_URL') ??
  fail(
    'PW_BASE_URL is required.',
    'The session is minted FOR a specific host: auth cookies are domain-scoped, so a file',
    'made for production will not authenticate against a preview deployment.',
  )

let baseUrl: URL
try {
  baseUrl = new URL(baseUrlRaw)
} catch {
  fail(`PW_BASE_URL is not a URL: ${baseUrlRaw}`)
}

const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL') ?? fail('NEXT_PUBLIC_SUPABASE_URL is required.')
const serviceRole =
  env('SUPABASE_SERVICE_ROLE_KEY') ??
  fail(
    'SUPABASE_SERVICE_ROLE_KEY is required.',
    'It is the only way to mint a session without an email round trip — `generateLink` is an',
    'admin API. It is read here and never written anywhere: the output file holds a normal',
    'member session, not this key.',
  )
// The anon key is public by construction (NEXT_PUBLIC_*), so falling back to the service-role
// key only changes which apikey header the verify call carries; the SESSION that comes back is
// the member's either way.
const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? serviceRole
const email =
  env('PW_MEMBER_EMAIL') ??
  fail(
    'PW_MEMBER_EMAIL is required.',
    'It must be an account that ALREADY EXISTS: `generateLink({ type: "magiclink" })` mints a',
    'link for a known user and does not create one.',
  )

const outPath = resolve(argValue('--out') ?? env('PW_STORAGE_STATE') ?? 'test/e2e/.auth/member.json')

/* ── 1. Mint the link (no email is sent) ─────────────────────────────────────────────── */

const admin = createServerClient(supabaseUrl, serviceRole, {
  cookies: { getAll: () => [], setAll: () => {} },
})

const { data: link, error: linkError } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
})
const tokenHash = link?.properties?.hashed_token
if (linkError || !tokenHash) {
  fail(
    `Could not mint a magic link for ${email}: ${linkError?.message ?? 'no hashed_token returned'}`,
    'If this says the user does not exist, sign in once with that address in the app first —',
    'the account has to be there before a link can be minted for it.',
  )
}

/* ── 2. Exchange it, and let @supabase/ssr write the cookies ─────────────────────────── */

const jar = new Map<string, JarCookie>()
const member = createServerClient(supabaseUrl, anonKey, {
  cookies: {
    getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
    setAll: (cookies: JarCookie[]) => {
      for (const cookie of cookies) jar.set(cookie.name, cookie)
    },
  },
})

const { data: session, error: verifyError } = await member.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'email',
})
if (verifyError || !session.session) {
  fail(`Could not exchange the link for a session: ${verifyError?.message ?? 'no session returned'}`)
}

// `createServerClient` applies its storage from an onAuthStateChange handler, which resolves a
// tick or two after verifyOtp returns. Wait for the jar rather than racing it.
const deadline = Date.now() + 5_000
while (jar.size === 0 && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 50))
}
if (jar.size === 0) {
  fail(
    'The session was minted but @supabase/ssr wrote no cookies.',
    'That means the cookie contract changed shape — read node_modules/@supabase/ssr/dist/main/',
    'createServerClient.js and fix this script rather than hand-writing the cookie.',
  )
}

/* ── 3. Shape it as a Playwright storage state ───────────────────────────────────────── */

const now = Math.floor(Date.now() / 1000)
const cookies: PlaywrightCookie[] = [...jar.values()].map(({ name, value, options }) => {
  const maxAge = Number(options?.maxAge ?? 0)
  return {
    name,
    value,
    // Host-only, matching how the browser would have stored it during a real sign-in.
    domain: baseUrl.hostname,
    path: options?.path ?? '/',
    expires: maxAge > 0 ? now + maxAge : -1,
    // Left exactly as @supabase/ssr set it (httpOnly is false by default, because the
    // browser client reads the same cookie). Do not "harden" this: the app would break.
    httpOnly: Boolean(options?.httpOnly),
    secure: baseUrl.protocol === 'https:',
    sameSite: 'Lax',
  }
})

/* ── 4. Verify BEFORE anyone trusts the file ─────────────────────────────────────────── */

const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
const bypass = env('VERCEL_AUTOMATION_BYPASS_SECRET')
const probeUrl = new URL('/feed', baseUrl).toString()
let landed = ''
try {
  const response = await fetch(probeUrl, {
    redirect: 'manual',
    headers: {
      cookie: cookieHeader,
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
  })
  const location = response.headers.get('location')
  landed = location ? new URL(location, baseUrl).pathname : '/feed'
  if (landed.startsWith('/sign-in')) {
    fail(
      `The minted session does NOT authenticate against ${baseUrl.origin} (/feed → ${landed}).`,
      'Most likely the deployment points at a different Supabase project than the one this',
      'script just used, or the member account was deleted. Nothing was written.',
    )
  }
  if (response.status >= 500) {
    fail(`${probeUrl} returned ${response.status}. Nothing was written — fix the deployment first.`)
  }
} catch (error) {
  fail(
    `Could not reach ${probeUrl} to verify the session: ${String(error)}`,
    'Against a protected preview, set VERCEL_AUTOMATION_BYPASS_SECRET so the probe gets past',
    "Vercel's Deployment Protection interstitial.",
  )
}

/* ── 5. Write it ─────────────────────────────────────────────────────────────────────── */

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`, { mode: 0o600 })

console.log(`\n✅ Member session minted for ${email}`)
console.log(`   target   ${baseUrl.origin}`)
console.log(`   verified /feed → ${landed}${landed === '/feed' ? '' : '  ⚠️ not /feed — see below'}`)
console.log(`   cookies  ${cookies.length} (${cookies.map((c) => c.name).join(', ')})`)
console.log(`   written  ${outPath}  (mode 600, git-ignored)`)
console.log(`\n   PW_STORAGE_STATE=${outPath}\n`)
if (landed !== '/feed') {
  console.log(
    `   ⚠️ The session is valid but /feed redirected to ${landed}. If that is /onboarding, finish\n` +
      '      onboarding once as this account — otherwise the shell baselines would capture the\n' +
      '      onboarding flow under the feed\'s name.\n',
  )
}

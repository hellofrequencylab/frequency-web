// Does a member page's markup carry the nonce its own strict policy names? (SCAN-1243)
//
// WHY IT EXISTS. The nonce-based script policy (lib/security/csp-nonce.ts) rides member pages as
// Content-Security-Policy-Report-Only during its test run. On 2026-11-23 the report sink showed
// 1,122 reports in 23 hours from /feed, /lead and Space pages, and the samples were Next's OWN
// scripts (`self.__next_f.push`, `$RC(`, the Turbopack chunks). So the nonce in the response header
// and the nonce on the scripts did not agree, and enforcing would have stopped the member app.
// A unit test cannot see that: it is a property of the rendered document on the platform.
//
// WHAT IT READS. One signed-in document request per page, no browser parse: the response's nonce
// policy header, then every <script> tag in the raw HTML. A script passes when it carries the
// header's nonce, when it is a data block the browser never executes, or when the policy lists its
// SHA-256. Everything else is counted and named, and the test fails with the tally.
//
// WHEN IT RUNS. Only on a `workflow_dispatch` (`e2e (manual)` with capture_shell on, which mints
// the member session), or by hand with PW_CSP_NONCE=1. It needs a session, because a signed-out
// request to a member page is redirected. It skips on pull requests until the mismatch it found is
// fixed; the fix makes it a gate (docs/RUNBOOKS.md "Nonce-based script policy").
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { test, expect } from './fixtures'

const baseURL = process.env.PW_BASE_URL
const storageState = process.env.PW_STORAGE_STATE
const hasSession = Boolean(storageState && existsSync(storageState))
const asked = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.env.PW_CSP_NONCE === '1'
const spaceSlug = process.env.PW_SPACE_SLUG

/** Member pages the reports named: a plain one, a second plain one, and a Space (a proxy rewrite). */
const PAGES: readonly string[] = ['/feed', '/lead', ...(spaceSlug ? [`/spaces/${spaceSlug}`] : [])]

const NONCE_SOURCE = /'nonce-([A-Za-z0-9+/_-]+={0,2})'/
const DATA_BLOCK = /\btype="(?:application\/(?:ld\+)?json|speculationrules|importmap)"/

type Tally = { total: number; nonced: number; hashed: number; data: number; wrongNonce: number; bare: string[] }

function readScripts(html: string, nonce: string, policy: string): Tally {
  const tally: Tally = { total: 0, nonced: 0, hashed: 0, data: 0, wrongNonce: 0, bare: [] }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const [, attrs, body] = match
    tally.total += 1
    if (DATA_BLOCK.test(attrs)) {
      tally.data += 1
      continue
    }
    const own = /\bnonce="([^"]*)"/.exec(attrs)?.[1]
    if (own === nonce) {
      tally.nonced += 1
      continue
    }
    if (own !== undefined) tally.wrongNonce += 1
    const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
    if (body && policy.includes(hash)) {
      tally.hashed += 1
      continue
    }
    const src = /\bsrc="([^"]*)"/.exec(attrs)?.[1]
    tally.bare.push(src ? `src ${src.split('/').slice(-1)[0]}` : `inline ${body.slice(0, 40).replace(/\s+/g, ' ')}`)
  }
  return tally
}

test.describe('@smoke nonce policy matches the document', () => {
  test.skip(!baseURL, 'PW_BASE_URL is not set')
  test.skip(!asked, 'a diagnostic for now: runs on workflow_dispatch or with PW_CSP_NONCE=1')
  test.skip(!hasSession, 'PW_STORAGE_STATE missing: a signed-out request to a member page is redirected')
  test.use({ storageState: hasSession ? storageState : undefined })

  for (const path of PAGES) {
    test(`${path} carries its own nonce on every script`, async ({ context }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'one document request per page is enough')
      const response = await context.request.get(path, {
        headers: { accept: 'text/html,application/xhtml+xml' },
      })
      const headers = response.headers()
      const routing = ['x-matched-path', 'x-vercel-cache', 'x-nextjs-prerender', 'x-nextjs-postponed', 'cache-control', 'age', 'location']
        .map((name) => `${name}=${headers[name] ?? '-'}`)
        .join(' ')
      console.log(`[csp-nonce] ${path} status=${response.status()} ${routing}`)
      // Redirects are followed: a protected preview answers the first request with a 307 to the same
      // path that sets its bypass cookie. A redirect anywhere else means the session did not hold.
      const landed = new URL(response.url()).pathname
      expect(response.status(), `${path} did not render for the member session (${routing})`).toBe(200)
      expect(landed, `${path} was redirected to ${landed}, so this is not the member page`).toBe(path)

      const reportOnly = headers['content-security-policy-report-only']
      const enforced = headers['content-security-policy']
      const policy = [reportOnly, enforced].find((value) => value && NONCE_SOURCE.test(value))
      test.skip(!policy, `${path}: no nonce policy on the response, so both rollout switches are off here`)
      const nonce = NONCE_SOURCE.exec(policy!)![1]

      const html = await response.text()
      const tally = readScripts(html, nonce, policy!)
      console.log(`[csp-nonce] ${path} render saw: ${/name="fq-csp-debug" content="([^"]*)"/.exec(html)?.[1] ?? 'no debug meta'}`)
      const distinct = new Set([...html.matchAll(/<script\b[^>]*\bnonce="([^"]*)"/g)].map((m) => m[1]))
      console.log(
        `[csp-nonce] ${path} mode=${reportOnly === policy ? 'report-only' : 'enforce'} scripts=${tally.total} nonced=${tally.nonced} hashed=${tally.hashed} data=${tally.data} wrongNonce=${tally.wrongNonce} bare=${tally.bare.length} distinctNoncesInMarkup=${distinct.size} headerNonceInMarkup=${distinct.has(nonce)}`,
      )
      for (const line of tally.bare.slice(0, 12)) console.log(`[csp-nonce] ${path} would be blocked: ${line}`)

      expect(
        tally.bare.length,
        `${path}: ${tally.bare.length} of ${tally.total} scripts carry neither the response's nonce nor a listed hash (${tally.wrongNonce} carry a different nonce). First: ${tally.bare.slice(0, 3).join(' | ')}`,
      ).toBe(0)
    })
  }
})

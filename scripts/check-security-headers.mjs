#!/usr/bin/env node
// check:security-headers — the response headers every route ships are still there (SCAN-1144).
//
// next.config.ts sets the browser's security headers in one place: `securityHeaders` (applied to
// `/:path*`) and the per-route Permissions-Policy. Nothing asserted them, so a tidy-up that dropped
// HSTS, softened the CSP back to report-only, or lost `object-src 'none'` would have passed every
// gate and shipped. This reads next.config.ts as text and fails when any of them is missing or weak.
// (scripts/check-headers.mjs is unrelated: it guards the page-heading contract.)
//
// It checks presence and the floor, not the whole policy: CSP source lists change with every new
// embed and are reviewed in the PR that adds them. What must never go missing is below.
//
// Usage: `node scripts/check-security-headers.mjs` (or `pnpm check:security-headers`).

import { readFileSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const CONFIG = 'next.config.ts'

/** CSP directives that close a class of attack on their own. Each must stay in the policy. */
export const REQUIRED_CSP_DIRECTIVES = ["default-src 'self'", "base-uri 'self'", "object-src 'none'", 'frame-ancestors', "form-action 'self'"]

/** Headers `securityHeaders` must carry on every route. */
export const REQUIRED_HEADERS = ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'Content-Security-Policy']

const ONE_YEAR = 31536000

/** The text between `const <name> = [` and its matching `]`, or null. */
function arrayBody(src, name) {
  const at = src.indexOf(`const ${name} = [`)
  if (at === -1) return null
  let depth = 0
  for (let i = src.indexOf('[', at); i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']' && --depth === 0) return src.slice(src.indexOf('[', at) + 1, i)
  }
  return null
}

/**
 * @param {string} src next.config.ts
 * @returns {string[]} one message per problem; empty when the headers hold
 */
export function checkSecurityHeaders(src) {
  const problems = []
  const body = arrayBody(src, 'securityHeaders')
  if (body === null) return ['next.config.ts has no `const securityHeaders = [` array, so no route gets the baseline headers.']

  for (const key of REQUIRED_HEADERS) {
    if (!new RegExp(`key:\\s*'${key}'`).test(body)) problems.push(`securityHeaders no longer sets ${key}.`)
  }
  if (/Content-Security-Policy-Report-Only/.test(body) && !/key:\s*'Content-Security-Policy'/.test(body)) {
    problems.push('The CSP is report-only. It graduated to enforced (ADR-170); report-only blocks nothing.')
  }

  const hsts = body.match(/key:\s*'Strict-Transport-Security',\s*value:\s*'([^']*)'/)?.[1]
  if (hsts !== undefined) {
    const maxAge = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0)
    if (maxAge < ONE_YEAR) problems.push(`Strict-Transport-Security max-age is ${maxAge}; it must be at least ${ONE_YEAR} (one year).`)
    if (!/includeSubDomains/i.test(hsts)) problems.push('Strict-Transport-Security lost includeSubDomains.')
  }

  const xfo = body.match(/key:\s*'X-Frame-Options',\s*value:\s*'([^']*)'/)?.[1]
  if (xfo !== undefined && !/^(SAMEORIGIN|DENY)$/.test(xfo)) problems.push(`X-Frame-Options is ${xfo}; it must be SAMEORIGIN or DENY.`)

  const nosniff = body.match(/key:\s*'X-Content-Type-Options',\s*value:\s*'([^']*)'/)?.[1]
  if (nosniff !== undefined && nosniff !== 'nosniff') problems.push(`X-Content-Type-Options is ${nosniff}; it must be nosniff.`)

  // The policy string lives in `const csp = [ ... ]`; its directives are the quoted array items.
  const csp = arrayBody(src, 'csp')
  if (csp === null) problems.push('next.config.ts has no `const csp = [` array to read the policy from.')
  else {
    for (const directive of REQUIRED_CSP_DIRECTIVES) {
      if (!csp.includes(directive)) problems.push(`The CSP lost ${directive}.`)
    }
  }

  if (!/source:\s*'\/:path\*',\s*headers:\s*securityHeaders/.test(src)) {
    problems.push('headers() no longer applies securityHeaders to `/:path*`, so no route would send them.')
  }

  const policy = src.match(/const PERMISSIONS_POLICY_DEFAULT\s*=\s*'([^']*)'/)?.[1]
  if (policy === undefined) problems.push('next.config.ts has no PERMISSIONS_POLICY_DEFAULT, so Permissions-Policy is not sent by default.')
  else {
    for (const feature of ['camera=(', 'microphone=(']) {
      if (!policy.includes(feature)) problems.push(`The default Permissions-Policy does not restrict ${feature.slice(0, -2)}.`)
    }
    if (/(camera|microphone)=\*/.test(policy)) problems.push('The default Permissions-Policy grants camera or microphone to every origin.')
  }
  if (!/key:\s*'Permissions-Policy'/.test(src)) problems.push('headers() never sets a Permissions-Policy header.')

  return problems
}

function main() {
  const problems = checkSecurityHeaders(readFileSync(CONFIG, 'utf8'))
  if (problems.length === 0) {
    console.log(`✓ Security headers: ${REQUIRED_HEADERS.length} baseline headers, the CSP floor and a default Permissions-Policy are all present in ${CONFIG}.`)
    return
  }
  console.error(`✗ Security headers: ${problems.length} problem(s) in ${CONFIG}.\n`)
  for (const p of problems) console.error(`  • ${p}`)
  console.error('\n  These headers go out on every response. Restore the one that went missing; do not delete the check.')
  process.exit(1)
}

if (invokedDirectly(import.meta.url)) main()

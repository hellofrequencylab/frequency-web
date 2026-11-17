#!/usr/bin/env node
// LIVE-2321: after a publish the website editor offers a visible "View live site" link to https://<host>/
// in a new tab, not only a "Published to <host>" toast with nothing to click. Checks the consequence in
// source, for the Frequency toolbar (FQ_EDITOR, live in production) and the legacy one:
//   1. A publish (not a schedule) turns the link on.
//   2. The link sits in the toolbar beside Publish, opens https://<host>/ in a new tab with noopener.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../components/sites/editor/shell.tsx', import.meta.url), 'utf8')
const fails = []

if (!/export function liveSiteHref\(host: string\): string \{\s*return `https:\/\/\$\{host\}\/`/.test(src)) {
  fails.push('no liveSiteHref(host) building https://<host>/')
}
if (!/Published to \$\{host\}`\); if \(!schedule\) setPublishedLive\(true\)/.test(src)) {
  fails.push('a publish does not turn on the live link')
}
const links = [...src.matchAll(/\{publishedLive && <a [^>]*data-live-link[^>]*>[\s\S]*?<\/a>\}/g)].map((m) => m[0])
if (links.length < 2) fails.push(`expected the live link in both toolbars, found ${links.length}`)
for (const link of links) {
  if (!/href=\{liveSiteUrl\}/.test(link) || !/target="_blank"/.test(link) || !/rel="noopener noreferrer"/.test(link) || !/View live site/.test(link)) {
    fails.push(`live link is not a new-tab "View live site" to the host: ${link.slice(0, 120)}`)
  }
}
// The Frequency toolbar's link sits right before its Publish button.
if (!/data-live-link[^\n]*View live site<\/a>\}\n\s*<button type="button" className="btn pa"/.test(src)) {
  fails.push('the Frequency toolbar link is not beside Publish')
}

if (fails.length) {
  console.error(`LIVE-2321 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2321 ok: after a publish the editor shows View live site beside Publish')

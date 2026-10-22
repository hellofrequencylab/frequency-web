#!/usr/bin/env node
// LIVE-1298 probe: a member card that opens another site opens it from Frequency's own /card/<token>/go
// page, so closing that site lands back on Frequency. Fails if /c/<token> sends a tap straight to another
// site again, if the hop page is gone, or if the hop stops sending a returning visitor to Frequency.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const route = r('app/c/[token]/route.ts')
if (!/target\.to === 'link' && isOwnSiteLink\(target\.url, origin\)\) res = NextResponse\.redirect/.test(route))
  bad.push('/c/<token> no longer keeps the direct redirect to Frequency pages only')
if (!/\/card\/\$\{encodeURIComponent\(token\)\}\/go\?n=/.test(route)) bad.push('/c/<token> sends another site straight there')
if (!/<OutboundHop url=\{target\.url\}/.test(r('app/(public)/card/[token]/go/page.tsx'))) bad.push('the /card/<token>/go hop page is gone')
if (!/window\.location\.replace\('\/'\)/.test(r('app/(public)/card/[token]/go/outbound-hop.tsx')))
  bad.push('a visitor who closes the site is not sent on to Frequency')
if (bad.length) {
  console.error('LIVE-1298 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1298: a card that opens another site goes through Frequency, so closing it lands on Frequency')

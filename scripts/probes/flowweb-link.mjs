#!/usr/bin/env node
// LIVE-2257: FlowWeb's drafts carry Frequency short links (/q/<slug>) instead of long tracked links.
//
// Fails when a FlowWeb link on this site is refused, when a page on another host, a link without
// utm_source=flowweb, or an existing short link is accepted, when the destination loses a utm_* param,
// or when the route loses its signature check or stops writing a managed url code.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-link.mjs
import { existsSync, readFileSync } from 'node:fs'

const { parseLinkRequest } = await import('../../lib/flowweb/short-link.ts')

const site = 'https://frequencylocal.com'
const long =
  'https://frequencylocal.com/start/host?persona=practitioner&region=north-county-sd&src=hunt&utm_source=flowweb&utm_medium=email&utm_campaign=hnt_c76a4813bf99&utm_content=hnt_c76a4813bf99-2d96466097d9'
const bad = []
const ok = parseLinkRequest({ url: long, title: 'Oceanside Art Collective' }, site)
if ('error' in ok) bad.push(`a FlowWeb link was refused: ${ok.error}`)
else {
  const q = new URL(ok.url).searchParams
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'])
    if (q.get(k) !== new URL(long).searchParams.get(k)) bad.push(`the destination lost ${k}`)
  if (ok.sourceTag !== 'hnt_c76a4813bf99') bad.push(`source tag: ${ok.sourceTag}`)
  if (!ok.title.includes('Oceanside Art Collective')) bad.push('the title lost the organizer name')
}
const refuse = [
  ['another host', long.replace('frequencylocal.com', 'evil.example')],
  ['no utm_source=flowweb', long.replace('utm_source=flowweb', 'utm_source=other')],
  ['a short link', 'https://frequencylocal.com/q/abc1234?utm_source=flowweb'],
  ['plain http', long.replace('https:', 'http:')],
]
for (const [why, url] of refuse) if (!('error' in parseLinkRequest({ url }, site))) bad.push(`accepted ${why}`)

const route = 'app/api/webhooks/flowweb-link/route.ts'
if (!existsSync(route)) bad.push(`${route} is missing`)
else {
  const src = readFileSync(route, 'utf8').replace(/\/\/.*$/gm, '')
  if (!/verifySignature\(/.test(src)) bad.push('the route lost its signature check')
  if (!/from\('qr_codes'\)/.test(src) || !/destination_type: 'url'/.test(src)) bad.push('the route no longer writes a managed url code')
  if (!/shortLinkUrl\(/.test(src)) bad.push('the route no longer answers a /q short link')
}

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('LIVE-2257: FlowWeb drafts can get Frequency short links')

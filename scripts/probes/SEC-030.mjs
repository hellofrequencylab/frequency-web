#!/usr/bin/env node
// SEC-030: the FlowWeb claim webhook refuses an oversized body before it buffers it. The route reads the
// body before the HMAC check (the signature covers the body), so an unauthenticated caller could make the
// function hold any size of body in memory. Passes while the route reads through readCappedText with a
// cap, answers 413 over it, and the helper checks Content-Length AND counts the streamed bytes.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8') : ''
}
const route = read('app/api/webhooks/flowweb-claim/route.ts')
const helper = read('lib/net/capped-body.ts')

const problems = []
if (!route) problems.push('app/api/webhooks/flowweb-claim/route.ts is missing')
else {
  if (/await req\.(text|json|arrayBuffer)\(\)/.test(route)) problems.push('the route still buffers the whole body with req.text()/json()/arrayBuffer()')
  if (!/readCappedText\(req,\s*\w+\)/.test(route)) problems.push('the route does not read the body through readCappedText')
  if (!/status:\s*413/.test(route)) problems.push('an oversized body is not refused with 413')
  const sigAt = route.indexOf('verifySignature(secret')
  const capAt = route.indexOf('readCappedText(req')
  if (capAt === -1 || sigAt === -1 || capAt > sigAt) problems.push('the capped read does not come before the signature check')
}
if (!helper) problems.push('lib/net/capped-body.ts is missing')
else {
  if (!/content-length/.test(helper)) problems.push('the helper ignores a declared Content-Length')
  if (!/getReader\(\)/.test(helper) || !/total > maxBytes/.test(helper)) problems.push('the helper does not cap the bytes actually streamed')
}

if (problems.length) {
  console.error(`SEC-030 FAIL\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('SEC-030 ok: the claim webhook caps its body by header and by bytes read, and answers 413 over it')

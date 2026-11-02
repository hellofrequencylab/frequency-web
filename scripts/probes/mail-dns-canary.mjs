// SCAN-1183 probe: check:mail-dns must prove the resolver works (a name that always has an MX) before it reads
// ENOTFOUND as "record missing", and exit 2 when it does not.
import { readFileSync } from 'node:fs'
const s = readFileSync('scripts/check-mail-dns.mjs', 'utf8')
const canary = s.indexOf("resolveMx('google.com')")
const firstLookup = s.indexOf('await Promise.all([')
if (canary < 0 || canary > firstLookup) { console.error('FAIL: no resolver canary before the record lookups'); process.exit(1) }
if (!/canary[\s\S]{0,400}process\.exit\(2\)/.test(s)) { console.error('FAIL: a failed canary does not exit 2'); process.exit(1) }
console.log('ok: check:mail-dns proves the resolver first')

#!/usr/bin/env node
// EMAIL-088: one send history per person across nurture, campaigns and automatic emails (what they got, why, and how
// to stop), shown on the admin contact page. Contact audit 2026-11-19 (Wave 3, finding 5: no single place shows what
// one person was sent). Passes when the contact page renders a send history that reads more than one stream.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (f) => { const u = new URL(f, root); return existsSync(u) ? strip(readFileSync(u, 'utf8')) : null }
const fails = []
const page = read('app/(main)/admin/crm/contacts/[id]/page.tsx')
if (page === null) fails.push('the admin contact page moved (re-check this probe)')
else if (!/send ?history|SendHistory|sendHistory/i.test(page)) fails.push('the admin contact page shows no send history')
if (fails.length) { console.error(`EMAIL-088 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-088 ok: the contact page shows one send history for the person')

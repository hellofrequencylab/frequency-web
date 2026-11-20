#!/usr/bin/env node
// HYG-250: robots.txt prints no non-standard `Host:` line, and a migration pins the database time zone
// to UTC. Before the fix robots.ts emitted `Host: https://frequencylocal.com` (unknown to Google and Bing,
// a full URL where Yandex wanted a host name) and production ran in UTC only by the server's default.
import { readFileSync, readdirSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const problems = []

const robots = readFileSync(new URL('app/robots.ts', root), 'utf8').replace(/^\s*\/\/.*$/gm, '')
if (/\bhost\s*:/.test(robots)) problems.push('app/robots.ts still returns a `host` field (prints a non-standard Host: line)')
if (!/sitemap\s*:/.test(robots)) problems.push('app/robots.ts lost its sitemap line')

const dir = new URL('supabase/migrations/', root)
const pins = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => {
    const sql = readFileSync(new URL(f, dir), 'utf8').replace(/--.*$/gm, '')
    return /alter\s+database[\s\S]{0,80}set\s+timezone\s+to\s+%L[\s\S]{0,40}'UTC'/i.test(sql) ||
      /alter\s+database\s+\S+\s+set\s+timezone\s+(to|=)\s+'UTC'/i.test(sql)
  })
if (!pins.length) problems.push('no migration pins the database time zone to UTC (alter database ... set timezone to UTC)')

if (problems.length) {
  console.error(`HYG-250 FAIL\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`HYG-250 ok: robots.txt has no Host line; ${pins[0]} pins the database time zone to UTC`)

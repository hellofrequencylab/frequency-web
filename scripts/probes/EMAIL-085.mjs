#!/usr/bin/env node
// EMAIL-085: every contact who may get marketing email carries a permission record: where they said yes, when, on
// which page or form, and the wording they saw. Contact, funnel and tracking audit 2026-11-19 (Wave 2).
// Passes when a migration stores that record (a consent table or consent columns on contacts) and the Email Studio
// audience reads it before it counts an imported contact as mailable.
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').replace(/^\s*\/\/.*$/gm, '')
const dir = new URL('supabase/migrations/', root)
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => strip(readFileSync(new URL(f, dir), 'utf8'))).join('\n')
const fails = []
if (!/create table[^;]*\bcontact_(consents|permissions)\b|alter table[^;]*\bcontacts\b[^;]*add column[^;]*\bconsent_(source|wording|captured_at|at)\b/i.test(sql)) {
  fails.push('no migration stores a per-contact permission record (source, time, page or form, wording)')
}
const audUrl = new URL('lib/email-studio/', root)
const studio = existsSync(audUrl)
  ? readdirSync(audUrl).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => strip(readFileSync(new URL(f, audUrl), 'utf8'))).join('\n')
  : ''
if (!/contact_(consents|permissions)|consent_(source|wording|captured_at|at)/.test(studio)) {
  fails.push('lib/email-studio never reads the permission record when it builds an audience')
}
if (fails.length) { console.error(`EMAIL-085 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-085 ok: contacts carry a permission record and Email Studio reads it')

#!/usr/bin/env node
import { readFileSync } from 'node:fs'
const home = readFileSync('components/frequency/site/pages/home/frequency-home.tsx', 'utf8')
const seo = readFileSync('lib/seo/frequency-pages.ts', 'utf8').split('community:')[0]
const failures = []
for (const phrase of ['Land where your town looks', 'Rise by how often you gather', 'A full room at night', 'your whole town reads', 'someone saves you a spot', 'Grow without burning out']) {
  if (home.includes(phrase)) failures.push(`Home still publishes unsupported or retired copy: ${phrase}`)
}
if (!home.includes('OPENING_DATE_LABEL')) failures.push('Home beta copy no longer reads the shared date')
const visible = home.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,:])/g, '$1')
for (const key of ['headline', 'lede']) {
  const match = seo.match(new RegExp(`${key}: '([^']*(?:’[^']*)*)'`))
  if (!match || !visible.includes(match[1])) failures.push(`Home ${key} differs from its search/structured-data text`)
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('Home copy has no retired/outcome promises, uses the shared beta date and matches structured-data copy')

#!/usr/bin/env node
import { readFileSync } from 'node:fs'
const source = readFileSync('lib/marketing/funnel-config.ts', 'utf8')
const retired = ['six logins', 'back office', 'One room, one list', 'Fill the room', 'Your calendar fills', 'Each event fills', 'Set up in an afternoon', 'Every hello, remembered', 'Every introduction, an open door']
const bad = retired.filter(s => source.toLowerCase().includes(s.toLowerCase()))
if (bad.length) { console.error('Audience pages retain retired wording: '+bad.join(', ')); process.exit(1) }
for (const [audience, action] of [['coaches-and-healers','sessions'],['studios','class'],['event-hosts','ticket'],['venues','host'],['nonprofits','donat'],['networks','chapter']]) {
  const start = source.indexOf(`slug: '${audience}'`)
  if (start < 0 || !source.slice(start,start+10000).toLowerCase().includes(action)) { console.error(`Missing concrete ${audience} story`); process.exit(1) }
}
console.log('Audience copy retains concrete route-specific tasks without retired reach/outcome promises')

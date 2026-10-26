import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const page = readFileSync('components/frequency/site/pages/home/frequency-home.tsx', 'utf8')
const hero = page.match(/<h1 className="h-xl">([\s\S]*?)<\/h1>/)?.[1]
assert.ok(hero, 'Home must expose its hero heading')
const text = hero.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
assert.equal(text, 'Build circles, not walls.')
assert.ok(!hero.includes('<Sided'), 'The brand promise must remain the same for Browse and Host')
assert.ok(readFileSync('lib/seo/frequency-pages.ts', 'utf8').includes("headline: 'Build circles, not walls.'"), 'Search headline must agree')
assert.ok(!page.includes('Start with one Thursday.'), 'A generic home must not invent a weekday')
console.log('Home brand promise agrees across audience modes and search metadata.')

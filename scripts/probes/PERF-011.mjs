// PERF-011: a public event page serves its cover right-sized and asks for it first.
import { readFileSync } from 'node:fs'

const src = readFileSync('components/frequency/members/event/public-event-body.tsx', 'utf8')
const bad = []
if (!/\/_next\/image\?url=\$\{encodeURIComponent\(url\)\}&w=1080&q=75/.test(src)) bad.push('the cover is not routed through the image optimizer')
if (!/coverSrc = heroUrl \? coverRendition\(heroUrl\) : null/.test(src)) bad.push('the hero does not use the right-sized rendition')
if (!/<link rel="preload" as="image" href=\{coverSrc\} fetchPriority="high"/.test(src)) bad.push('the cover is not preloaded')
if (bad.length) {
  console.error('PERF-011: ' + bad.join('; '))
  process.exit(1)
}
console.log('PERF-011: the event cover is served at 1080 wide through the optimizer and preloaded')

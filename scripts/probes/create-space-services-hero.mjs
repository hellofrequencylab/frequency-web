// LIVE-2285: the Services builder preview wears the Services theme's own window-washer hero, not a New World stand-in.
import fs from 'node:fs'
const site = fs.readFileSync('lib/create-space/preview-site.ts', 'utf8')
if (!/services: \{\s*hero: '\/sites\/services\/hero-squeegee\.webp'/.test(site)) {
  console.error('the Services preview hero is not the Services theme hero (hero-squeegee.webp)')
  process.exit(1)
}
if (!fs.existsSync('public/sites/services/hero-squeegee.webp')) { console.error('hero-squeegee.webp is missing'); process.exit(1) }
console.log('create-space-services-hero: Services preview wears its own hero')

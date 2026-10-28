// The Temple Kit site chrome exists: the announce bar, the sticky glass header and its pill variant, the bag drawer, the account
// menu, the sunk-plaster footer with its letter, all scoped under the kit root and registered through site-chrome.tsx.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const css = read('components/sites/temple-kit-chrome-css.ts')
const chrome = read('components/sites/site-chrome.tsx')
const want = [
  [css.includes('height:36px'), 'announce bar 36px'],
  [css.includes('width:440px') && css.includes('width:290px'), 'drawer 440 and menu 290'],
  [css.includes('data-site-header="pill"'), 'pill header'],
  [css.includes('.tk-footer-ground'), 'footer'],
  [read('components/sites/temple-kit-css.ts').includes('TEMPLE_KIT_CHROME_CSS'), 'registered in the skin'],
  [chrome.includes('TempleKitLogo') && chrome.includes('TempleKitBar') && chrome.includes('TempleKitTools'), 'wired in site-chrome'],
]
const bad = want.filter(([ok]) => !ok)
for (const [, what] of bad) console.error(`missing: ${what}`)
process.exit(bad.length ? 1 : 0)

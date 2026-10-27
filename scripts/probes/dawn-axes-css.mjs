import { readFileSync } from 'node:fs'

// HYG-187: the generation and occasion axes are retired (SCAN-1130), so no selector in
// app/globals.css may still key off them. Exits 0 only when none is left.
const css = readFileSync('app/globals.css', 'utf8')
const left = css.match(/\[data-(generation|occasion)[^\]]*\]/g) ?? []
if (left.length) {
  console.error(`${left.length} generation/occasion selector(s) left in app/globals.css`)
  process.exit(1)
}
console.log('no generation or occasion selectors in app/globals.css')

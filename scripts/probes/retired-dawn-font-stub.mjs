// HYG-187: the empty historical stub is not a runtime font registration.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
/** @param {{exists?: (path: string) => boolean, read?: (path: string) => string}} [options] */
export function retiredDawnFontStub({ exists = existsSync, read = (p) => readFileSync(p, 'utf8') } = {}) {
  assert.equal(exists('lib/theme/design-fonts/dawn.ts'), false, 'empty historical font stub returned')
  assert.match(read('lib/theme/design-fonts/active.ts'), /from '\.\/frequency'/, 'active faces remain Frequency')
  assert.match(read('lib/theme/design-fonts/frequency.ts'), /FONTS_DESIGN: DesignId = 'frequency'/, 'actual Frequency registration remains')
  const root = read('app/layout.tsx')
  assert.match(root, /from '@\/lib\/theme\/design-fonts\/active'/, 'root retains the active static font seam')
  for (const face of ['nunito', 'geist-mono', 'anton']) assert(root.includes(`./fonts/${face}/`), `shared ${face} registration remains`)
  return true
}
if (invokedDirectly(import.meta.url)) {
  retiredDawnFontStub()
  console.log('Empty historical font stub retired; actual Frequency and shared base registrations retained')
}

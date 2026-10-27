// HYG-186 is the unused flag only; owner successor HYG-187 separately tracks CSS/font retirement.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export function retiredThemeAxisFlag(source = readFileSync('lib/theme/design.ts', 'utf8')) {
  assert.doesNotMatch(source, /\b(?:LEGACY_THEME_AXES|legacyAxes)\b/, 'retired flag/property returned')
  assert.match(source, /export const SITE_DESIGN: DesignId = resolveDesign\(process\.env\.NEXT_PUBLIC_SITE_DESIGN\)/, 'canonical selection remains')
  assert.match(source, /export const DEFAULT_DESIGN: DesignId = 'frequency'/, 'Frequency stays the fallback')
  return true
}
// This broader diagnostic belongs to successor HYG-187, not completed SCAN-1130 or HYG-186.
export function legacyThemeResourcesRetired(css, dawnFontExists) {
  return !/\[data-(?:generation|occasion)[=\]]/.test(css) && !dawnFontExists
}
if (invokedDirectly(import.meta.url)) {
  retiredThemeAxisFlag()
  console.log('Unused legacy-axis flag/property retired; canonical Frequency selection remains')
}

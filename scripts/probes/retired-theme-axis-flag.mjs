// HYG-186 is the unused flag only; SCAN-1130 separately measures CSS/font retirement.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export function retiredThemeAxisFlag(source = readFileSync('lib/theme/design.ts', 'utf8')) {
  assert.doesNotMatch(source, /\b(?:LEGACY_THEME_AXES|legacyAxes)\b/, 'retired flag/property returned')
  assert.match(source, /export const SITE_DESIGN: DesignId = resolveDesign\(process\.env\.NEXT_PUBLIC_SITE_DESIGN\)/, 'canonical selection remains')
  assert.match(source, /export const DEFAULT_DESIGN: DesignId = 'frequency'/, 'Frequency stays the fallback')
  return true
}
// This broader resource check belongs to SCAN-1130, not the bounded flag-retirement row.
export function legacyThemeResourcesRetired(css, dawnFontExists) {
  return !/\[data-(?:generation|occasion)[=\]]/.test(css) && !dawnFontExists
}
if (invokedDirectly(import.meta.url)) {
  retiredThemeAxisFlag()
  console.log('Unused legacy-axis flag/property retired; canonical Frequency selection remains')
}

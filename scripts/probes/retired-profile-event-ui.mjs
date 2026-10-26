import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
// These implementations had no runtime importers; live surfaces use other components.
for (const file of [
  'app/(main)/events/events-filter-bar.tsx',
  'app/(main)/events/events-sort.tsx',
  'components/events/event-fact-panel.tsx',
  'components/spaces/space-profile-tabs.tsx',
]) assert.equal(existsSync(file), false, `Retired implementation returned: ${file}`)
for (const [file, symbols] of [
  ['lib/events/catalog-types.ts', ['CatalogFacet', 'SortOption']],
  ['lib/events/fact-types.ts', ['FactGuest']],
  ['lib/spaces/profile-tab.ts', ['SpaceProfileTab']],
]) {
  const source = readFileSync(file, 'utf8')
  for (const symbol of symbols) assert.match(source, new RegExp(`export (?:type|interface) ${symbol}\\b`))
  assert.doesNotMatch(source, /export (?:async )?function|['"]use client['"]/, `${file} must remain a type-only seam`)
}
// Keep saved layout compatibility registrations and the live replacement menu.
assert.match(readFileSync('lib/widgets/registry.tsx', 'utf8'), /'event-facts': EventFacts/)
assert.match(readFileSync('components/widgets/events/event-facts.tsx', 'utf8'), /export const EventFacts/)
assert.match(readFileSync('app/(main)/spaces/[slug]/(profile)/layout.tsx', 'utf8'), /<SpaceProfileMenu\b/)
console.log('Four retired implementations remain absent, shared types remain, and saved-layout/live-menu seams are preserved.')

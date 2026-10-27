import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
export function spaceJourneyCompletionWiring(read = p => readFileSync(p, 'utf8')) {
  const board = read('app/(main)/spaces/[slug]/manage/manage-board.tsx')
  const gate = board.indexOf('if (!canManage && !staffViewing) return null')
  assert(gate >= 0 && gate < board.indexOf('<FqOverviewBody'), 'manage authorization must precede the private overview')
  const overview = read('components/frequency/admin/pages/overview/overview-body.tsx')
  const start = overview.indexOf('const journeyStats = readSpaceCompletionAnalytics(spaceId)')
  assert(start >= 0 && start < overview.indexOf('await Promise.all'), 'completion read must start alongside independent overview reads')
  assert.match(overview, /<FqJourneyCompletionBand spaceId=\{spaceId\} slug=\{slug\}/, 'active Frequency overview must render owning Space Journey totals')
  const band = read('components/frequency/admin/pages/overview/journey-completion-band.tsx')
  assert.match(band, /statsPromise \?\? readSpaceCompletionAnalytics\(spaceId\)/, 'band must use scoped availability-aware totals')
  assert.match(band, /Journey data is unavailable or incomplete/, 'failed totals must stay unavailable')
  const reader = read('lib/spaces/completion-analytics.ts')
  assert.match(reader, /\.eq\('space_id', spaceId\)/, 'plan ownership scope missing')
  assert.match(reader, /\.in\('plan_id', planIds\)/, 'enrollment ownership scope missing')
  assert.match(reader, /\.order\('id'\)\s*\.range\(/, 'all-time totals need stable explicit pages')
  assert.match(reader, /return result\.available \? result\.stats : null/, 'partial totals cannot masquerade as measured zeros')
  return true
}
if (invokedDirectly(import.meta.url)) {
  spaceJourneyCompletionWiring()
  console.log('Active gated Frequency overview renders scoped, availability-aware Journey completion totals')
}

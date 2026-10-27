import fs from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
export const RETIRED = ['components/spaces/dashboard/space-dashboard.tsx', 'components/spaces/spaces-toolbar.tsx', 'components/spaces/spaces-sort.tsx', 'components/studio/market/new-listing-button.tsx', 'components/admin/admin-rail-drawer-column.tsx', 'lib/nav/admin-nesting.ts', 'lib/nav/admin-rail.ts', 'lib/nav/my-frequency-rows.ts']
export const MASKS = [['components/frequency/site/pages/discover/parts.tsx', 'discover-locator-cities'], ['app/(main)/settings/notifications/mutes-form.tsx', 'settings-subject-mutes'], ['components/frequency/admin/pages/overview/overview-body.tsx', 'space-console-stats'], ['components/spaces/reach-receipt.tsx', 'space-console-profile-stats'], ['components/frequency/admin/pages/overview/journey-completion-band.tsx', 'space-console-journey-stats'], ['components/frequency/admin/admin-nav.tsx', 'admin-rail']]
export function problems(read, exists) {
  const bad = []
  for (const file of RETIRED) if (exists(file)) bad.push(`Retired module returned: ${file}`)
  for (const [file, mask] of MASKS) if (!read(file).includes(`data-visual-mask="${mask}"`)) bad.push(`Live mask lost: ${mask}`)
  const shell = read('components/frequency/members/shell/members-shell.tsx')
  const header = read('components/frequency/members/shell/header.tsx')
  if (!shell.includes('drafts: myFrequency?.drafts') || !header.includes('<DraftsCount href={r.href} count={r.count}') || !header.includes('row(r.href, r.label, r.icon, r.count)')) bad.push('Actual Drafts count wiring lost')
  if (!read('app/(main)/spaces/[slug]/manage/manage-board.tsx').includes('<FqOverviewBody')) bad.push('Actual scoped overview mount lost')
  if (!read('components/frequency/members/marketplace/marketplace-body.tsx').includes('href="/classifieds/new"')) bad.push('Actual listing creation entrance lost')
  if (!read('app/(main)/admin/layout.tsx').includes('<FrequencyAdminConsole')) bad.push('Actual operator console mount lost')
  const overview = read('components/frequency/admin/pages/overview/overview-body.tsx')
  for (const call of ['spaceEarningsWindows(spaceId', 'getSpaceHealth(spaceId)', 'getWorklist({ spaceId })', '<FqJourneyCompletionBand', '<SpaceDispatchBand']) if (!overview.includes(call)) bad.push(`Actual scoped overview consequence lost: ${call}`)
  return bad
}
if (invokedDirectly(import.meta.url)) {
  const bad = problems(f => fs.readFileSync(f, 'utf8'), fs.existsSync)
  if (bad.length) { console.error(bad.join('\n')); process.exitCode = 1 } else console.log('Actual Frequency navigation replacements, Drafts count and live masks preserved; legacy modules retired')
}

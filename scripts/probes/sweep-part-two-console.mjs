#!/usr/bin/env node
// LIVE-2099: the second batch from the 2026-11-03 signed-in sweep (member app, Space and Circle
// consoles, admin). Source reads for each fix; every one failed on the tree before it.
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const bad = []
// 1. A membership whose profile join is empty is dropped at the Circle shell loader, so the Circle
//    home, members tab and Space circles page never read `m.profile.id` on undefined.
if (!/as unknown as MemberRow\[\]\)\.filter\(\(m\) => m\.profile\)/.test(read('lib/circles/store.ts'))) bad.push('lib/circles/store.ts: loadCircleShell keeps member rows with no profile')
// 2. The phone drawer's Frequency group lists one link per destination (About and Guidelines sat in both lists).
if (!/\[\.\.\.FQ_SITE_LINKS, \.\.\.FQ_ABOUT_LINKS\]\.filter\(/.test(read('components/frequency/members/shell/header.tsx'))) bad.push('header.tsx: the drawer website group is not de-duplicated by href')
// 3. FormSection's grid columns can shrink, so a wide table scrolls inside its panel on a phone.
const fs = read('components/admin/form-section.tsx')
if ((fs.match(/min-w-0 md:col-span-/g) || []).length < 4) bad.push('form-section.tsx: a grid column lacks min-w-0')
// 4. The member and contact sort chip groups can shrink and wrap instead of being clipped.
for (const p of ['components/people/member-viewer/member-viewer.tsx', 'app/(main)/admin/crm/contacts/contacts-roster-client.tsx']) {
  if (/inline-flex shrink-0 flex-wrap/.test(read(p))) bad.push(`${p}: the sort chip group is shrink-0 (clipped at 390)`)
}
// 5. axe: aria-pressed is not allowed on a link; the filter chips use aria-current.
if (/aria-pressed=\{!!onlineFilter\}/.test(read('app/(main)/network/page.tsx'))) bad.push('network/page.tsx: the Online now link carries aria-pressed')
if (/aria-pressed=\{on\}/.test(read('components/frequency/members/spaces/spaces-body.tsx'))) bad.push('spaces-body.tsx: a filter link carries aria-pressed')
// 6. axe: the At a glance card is a list, not a <dl> with icons between its terms.
if (/<dl /.test(read('components/people/community-sidebar.tsx'))) bad.push('community-sidebar.tsx: At a glance is still a <dl> with non-dt children')
// 7. axe: aria-controls only points at a results panel that exists.
if (/aria-controls="mc-help-results"/.test(read('components/frequency/members/help/help-search-pill.tsx'))) bad.push('help-search-pill.tsx: aria-controls names a panel that is not rendered')
// 8. axe: body links on the sequences page are underlined, not colour-only.
if (/text-primary-strong hover:underline/.test(read('app/(main)/pages/sequences/page.tsx'))) bad.push('pages/sequences: a body link is told apart by colour alone')
// 9. axe: the member listbox's <ul>/<li> are presentational so its options are its children.
const mv = read('components/people/member-viewer/member-viewer.tsx')
if (!/<ul role="presentation"/.test(mv) || !/<li role="presentation">/.test(mv)) bad.push('member-viewer.tsx: the listbox wraps its options in a real <ul>/<li>')
// 10. axe: the menu manager's drag and pinned handles carry a role for their aria-label; the banner body reads at 4.5:1.
if ((read('components/admin/menu/item-editor.tsx').match(/role="img"/g) || []).length < 2) bad.push('item-editor.tsx: a handle span has aria-label and no role')
if (/text-text\/80">\{children\}/.test(read('components/admin/status.tsx'))) bad.push('status.tsx: the banner body is text-text/80 (4.44:1 on the info tone)')
// 11. Two QR destinations share /crew; the option key carries the label.
if (/<option key=\{d\.path\} value=\{d\.path\}>/.test(read('app/(main)/admin/qr/dynamic-links.tsx'))) bad.push('dynamic-links.tsx: destination options are keyed by path alone')
// 12. axe: a labelled MapLibre pin that opens nothing is role=img (a bare div may not carry aria-label).
const canvas = read('components/maps/maplibre-canvas.tsx')
if (!/el\.setAttribute\('role', 'img'\)/.test(canvas)) bad.push('maplibre-canvas.tsx: a labelled non-interactive pin has aria-label and no role')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('circle members without a profile are dropped; drawer links unique; grids shrink; filter chips, lists, labels, map pins and link styling pass axe')

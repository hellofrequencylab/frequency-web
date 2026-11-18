// LIVE-2371: the Business of Community week cards fit a phone. Exit 0 = fixed, 1 = not.
// Field run 2026-11-18 (e2e-manual 44380142715): each week card ran 19 to 98 px past a 320 px viewport,
// because the one-column grids used `1fr` (min-content floor) and the meeting chip never wrapped.
import { readFileSync, existsSync } from 'node:fs'

const CSS = 'app/themes/frequency/site-pages-showcase.css'
if (!existsSync(CSS)) process.exit(79)
const css = readFileSync(CSS, 'utf8')
const P = '.pa-boc '
const fails = []
const has = (sel, decl) => css.split('\n').some((l) => l.includes(P + sel + '{') && l.includes(decl))
if (!has('.boc-weeks', 'grid-template-columns:minmax(0,1fr)')) fails.push('the week list column can grow past the viewport')
if (!has('.boc-week', 'grid-template-columns:minmax(0,1fr)')) fails.push('a stacked week card has a min-content floor')
if (!has('.boc-week-g', 'grid-template-columns:minmax(0,1fr)')) fails.push('the stacked fixes/leave-with grid has a min-content floor')
if (!has('.boc-week-t .boc-chip', 'white-space:normal')) fails.push('the meeting chip cannot wrap on a phone')
if (fails.length) {
  console.error(fails.join('; '))
  process.exit(1)
}
process.exit(0)

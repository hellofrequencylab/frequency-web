// Space Community wall (ADR-1938): a Space has a Community page and no built-in Circle. One probe, one stage per ledger row:
//   node scripts/probes/space-community-wall.mjs <stage>      stages: w0 w1 w2 w3 w4 w5 w6
// Each stage measures a consequence that is false today and true once its wave ships. Reads files under node, never a test runner.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadDecisions } from '../lib/ledger.mjs'

const stage = process.argv[2]
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const migrations = () => readdirSync('supabase/migrations').map((f) => [f, read(join('supabase/migrations', f))])
const bad = []

if (stage === 'w0') {
  if (/never the name of a Space-level surface/i.test(read('docs/NAMING.md'))) bad.push('NAMING.md still forbids "Community" as a Space-level surface (ADR-1091)')
  // The merged ADR ledger (folded file plus any fragments), never the fragment folder: compaction empties it.
  const adrs = loadDecisions().split(/^(?=#{2,3} ADR-)/m)
  if (!adrs.some((a) => /Community wall/i.test(a) && /Supersedes/i.test(a))) bad.push('no ADR records the Community wall decision and the ADRs it supersedes')
} else if (stage === 'w1') {
  const m = migrations().filter(([, sql]) => /space_wall_settings/.test(sql) && /scope_space_id/.test(sql) && /can_read_space_wall/.test(sql))
  if (!m.length) bad.push('no migration adds the Space post scope and the wall settings table')
} else if (stage === 'w2') {
  if (!existsSync('app/(main)/spaces/[slug]/(profile)/community/page.tsx')) bad.push('the Space Community page does not exist')
  if (!existsSync('app/(main)/spaces/[slug]/manage/community/page.tsx')) bad.push('the owner has no wall settings and moderation page')
  if (!/calendar/i.test(read('app/(main)/spaces/[slug]/(profile)/community/page.tsx'))) bad.push('the Community page does not show the Space calendar (owner ruling 7)')
  if (!/Who's here|Who&apos;s here/.test(read('app/(main)/spaces/[slug]/(profile)/community/page.tsx'))) bad.push('the Community side column has no About / Who is here panel from the design')
} else if (stage === 'w3') {
  for (const f of ['lib/spaces/space-discussion.ts', 'components/spaces/space-circle-card.tsx', 'components/widgets/circles/circle-space-info.tsx'])
    if (existsSync(f)) bad.push(`${f} still exists`)
} else if (stage === 'w4') {
  const cfg = read('next.config.ts')
  if (/source:\s*'\/spaces\/:slug\/community'[\s\S]{0,120}destination:\s*'\/spaces\/:slug\/circles'/.test(cfg)) bad.push('/spaces/:slug/community still redirects to /circles')
  // The sitemap emits Space tab URLs from listNetworkedSpaceProfileTabs, so the Community segment lives there.
  if (!/push\('community'\)/.test(read('lib/spaces/discovery.ts'))) bad.push('sitemap has no Space Community URL (no community segment in listNetworkedSpaceProfileTabs)')
  if (!/CollectionPage/.test(read('app/(main)/spaces/[slug]/(profile)/community/page.tsx'))) bad.push('the Community page carries no structured data naming the Space')
} else if (stage === 'w5') {
  const live = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  if (!migrations().some(([f, sql]) => f > '20270346028700' && /drop trigger[^;]*spaces_ensure_space_circle/i.test(live(sql)))) bad.push('no migration stops creating a Space Circle per new Space')
} else if (stage === 'w6') {
  if (/is_space_primary/.test(read('lib/database.types.ts'))) bad.push('circles.is_space_primary is still in the schema types')
} else {
  bad.push('unknown stage: pass w0 to w6')
}

if (bad.length) {
  console.error(`space-community-wall ${stage}: ${bad.join('; ')}`)
  process.exit(1)
}
console.log(`space-community-wall ${stage}: ok`)

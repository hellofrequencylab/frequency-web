// "Only me" calendar entries (owner ruling 2026-11-27, project thread "Layer personal, business and
// collective calendars": "Build it, team sees Busy"). A Space owner can add a Private date that only
// they read, and the rest of the team sees a Busy block with no details.
//   LIVE-2560  the visibility value exists in the table and the app, the read policy keeps an
//              only-me row to its creator, the team gets times only through space_personal_busy,
//              the quick add offers "Only me", and the service-role team feed skips those rows.
// Each check reads the code that decides the consequence (comments stripped).
import { readFileSync, readdirSync } from 'node:fs'

const id = process.argv[2]
const bad = []
const read = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    bad.push(`cannot read ${f}`)
    return ''
  }
}
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sql = (t) => t.replace(/^\s*--.*$/gm, '')

if (id === 'LIVE-2560') {
  const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  const mig = migs.map((f) => sql(read(`supabase/migrations/${f}`))).filter((t) => t.includes("'only_me'")).join('\n')
  if (!/visibility in \('team', 'public_unavailable', 'only_me'\)/.test(mig)) bad.push("the table does not accept visibility 'only_me'")
  if (!/when visibility = 'only_me' then created_by = private\.get_my_profile_id\(\)/.test(mig)) bad.push('the read policy does not keep an only-me row to its creator')
  if (!/function public\.space_personal_busy[\s\S]*?select e\.starts_at, e\.ends_at, e\.all_day, e\.time_zone/.test(mig)) bad.push('there is no times-only Busy projection for the team')
  if (!/space_personal_busy[\s\S]*?private\.can_write_space_content\(p_space_id\)/.test(mig)) bad.push('the Busy projection is not limited to the Space team')
  const reg = code(read('lib/calendar/registry.ts'))
  if (!/ENTRY_VISIBILITIES = \[[^\]]*'only_me'/.test(reg)) bad.push('the app does not know the only_me visibility')
  const entries = code(read('lib/calendar/entries.ts'))
  if (!/onlyMe \? 'only_me'/.test(entries)) bad.push('the entry form never writes only_me')
  const store = code(read('lib/calendar/entries-store.ts'))
  if (!/rpc\('space_personal_busy'/.test(store) || !/personalBusyToItem/.test(store)) bad.push('the staff calendar does not draw teammates\' Busy blocks')
  const quick = code(read('components/calendar-suite/suite-quick.tsx'))
  if (!/label="Only me"/.test(quick)) bad.push('the quick add does not offer Only me')
  const feed = code(read('app/calendar/private/[token]/route.ts'))
  if ((feed.match(/\.neq\('visibility', 'only_me'\)/g) ?? []).length < 2) bad.push('the service-role team feed can still hand out an only-me entry')
} else {
  bad.push(`unknown id ${id}`)
}

if (bad.length) {
  console.error(`${id}: OPEN\n - ${bad.join('\n - ')}`)
  process.exit(1)
}
console.log(`${id}: done`)

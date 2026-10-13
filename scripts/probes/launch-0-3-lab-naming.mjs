// LIVE-912 PROBE (docs/LAUNCH-MARKETING-PLAN.md §14 Phase 0.3): The Lab reads as future tense,
// "Frequency Labs" is "Frequency", Crew stops promising free-for-everyone, and the category line is
// owner ruling R1's ("Local groups that keep meeting."). Reads the SHIPPED source of every file the
// row owns and fails on the consequence a reader would see:
//   1. no "Frequency Labs" (the software is Frequency; the room is The Lab);
//   2. none of the present-tense Lab claims the row removed (a place you can walk into today, the
//      first Lab "taking root" or "being built", "gather at The Lab", "Tour The Lab");
//   3. no "stays free for everyone" Crew line (R2 ends comped Crew at launch; R8 is support first);
//   4. the old category line ("Frequency is a Community Collective" as the category claim) is gone
//      from SITE_DESCRIPTION, llms.txt, llms-full.txt and the What is Frequency answer;
//   5. lib/site.ts defines CATEGORY_LINE as R1's line and SITE_DESCRIPTION opens on it, while
//      SITE_TAGLINE (the logo lockup) stays "Community Collective";
//   6. llms.txt carries no "Opening Beta" branch.
//
//   node scripts/probes/launch-0-3-lab-naming.mjs
import { readFileSync } from 'node:fs'

const SCOPE = [
  'lib/page-editor/templates/what-is-frequency.ts',
  'app/(marketing)/what-is-frequency/page.tsx',
  'lib/page-editor/templates/tools-for-community-builders.ts',
  'app/(marketing)/tools-for-community-builders/page.tsx',
  'lib/marketing/who-its-for.ts',
  'lib/site.ts',
  'app/llms.txt/route.ts',
  'app/llms-full.txt/route.ts',
]

const read = (p) => readFileSync(p, 'utf8')
// Copy only: line comments are dropped so a comment that names the retired wording (as this row's
// own comments do) is not a regression. ORG_LEGAL_NAME ("Frequency Labs Holdings") is the legal
// entity, not a product name, so it is exempt.
const copyOf = (p) =>
  read(p)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => !/ORG_LEGAL_NAME/.test(l))
    .join('\n')

const RETIRED = [
  { name: '"Frequency Labs" naming the product', re: /Frequency Labs(?! Holdings)/ },
  { name: '"Labs toolkit"', re: /Labs toolkit/ },
  { name: 'The Lab as a place you can walk into today', re: /a real place you can walk into/ },
  { name: 'The Lab as where the community gathers now', re: /third space the community gathers in/ },
  { name: 'the first Lab "taking root"', re: /first (Lab|one) is taking root/ },
  { name: 'the first Lab "being built"', re: /first Lab is being built/ },
  { name: '"gather at The Lab"', re: /gather at The`?,?\s*(`>\s*)?Lab/ },
  { name: '"Tour The Lab"', re: /Tour The Lab/ },
  { name: 'Crew "stays free for everyone"', re: /stays free for everyone/ },
  { name: 'the old category line', re: /Frequency is a Community Collective[.:]|is a Community Collective\. It exists|Frequency is a Community Collective built to/ },
  { name: 'the dormant "Opening Beta" branch', re: /Opening Beta rate/ },
]

const failures = []
for (const p of SCOPE) {
  const text = copyOf(p)
  for (const r of RETIRED) if (r.re.test(text)) failures.push(`${p}: ${r.name} is back`)
}

const site = read('lib/site.ts')
if (!/export const CATEGORY_LINE = "Local groups that keep meeting\.";/.test(site)) {
  failures.push('lib/site.ts: CATEGORY_LINE is not R1\'s "Local groups that keep meeting."')
}
const desc = /export const SITE_DESCRIPTION =\s*`([^`]*)`/.exec(site)
if (!desc || !desc[1].startsWith('${CATEGORY_LINE}')) {
  failures.push('lib/site.ts: SITE_DESCRIPTION does not open on CATEGORY_LINE (R1)')
}
if (!/export const SITE_TAGLINE = "Community Collective";/.test(site)) {
  failures.push('lib/site.ts: SITE_TAGLINE (the logo lockup) moved; this row must not change it')
}
const llms = read('app/llms.txt/route.ts')
if (!/`> \$\{CATEGORY_LINE\}/.test(llms)) failures.push('app/llms.txt/route.ts: the summary does not open on CATEGORY_LINE (R1)')

if (failures.length) {
  console.error(`LIVE-912: ${failures.length} regression(s)\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`LIVE-912: ${SCOPE.length} files hold R1's category line, a future-tense Lab, "Frequency", and no free-for-everyone Crew line`)

// Probes for the 2026-11-16 whole-site audit rows (SCAN-1206..SCAN-1243). Each row's verify cmd is
// `node scripts/probes/audit-2026-11-16.mjs <ROW-ID>`; the check for that row runs below and exits 0 only
// when the finding is fixed. They are direction checks written by the audit: they fail today by design.
// A row's own fix may retime its check only with the owner's phrase for that row.
//
// REWRITTEN CHECKS. Daniel approved rewriting four of these on 2026-11-16 15:02Z ("rewrite the
// audit-written checks for SCAN-1226, 1213, 1225 and 1215 to measure the real fix"). Each of the four
// is a function in REWRITTEN below, with what the old check got wrong written above it. A rewritten
// check prints what it found, so a red run names the files. No other entry in CHECKS was changed.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Tracked files matching the pathspecs that are present in the tree on disk. */
function tracked(...pathspecs) {
  const r = spawnSync('git', ['ls-files', '-z', '--', ...pathspecs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error('git ls-files failed: ' + r.stderr)
  return r.stdout.split('\0').filter((p) => p && existsSync(p))
}

/** Source text with block and line comments removed, so a word in a comment never counts as code. */
function code(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const isSource = (p) => /\.tsx?$/.test(p) && !/\.test\./.test(p) && !p.startsWith('mobile/')

const REWRITTEN = {
  // SCAN-1215. The finding: private copies of the slug rule that do not fold accents, so "Café"
  // becomes "caf" through one door and "cafe" through another. The old check allowed one
  // `function slugify(` in the whole tree, which cannot pass while two copies are held in place by
  // other guards: the Hunts FH-002 fixture (scripts/probes/hunts/legacy-seam-evidence.mjs) loads
  // app/(main)/admin/qr/campaign-actions.ts with a fixed import list, and the LIVE-765 probe
  // (scripts/live-765-probe.mjs) does the same for lib/journey-plans.ts; both refuse a new import of
  // @/lib/utils. Those two are the named exception, counted, and nothing else may join them.
  // Green means: lib/utils.ts still exports the shared rule, and no file outside PINNED declares
  // its own. Converting a pinned file shrinks the count and stays green; a new copy turns it red.
  'SCAN-1215': () => {
    const SHARED = 'lib/utils.ts'
    const PINNED = ['app/(main)/admin/qr/campaign-actions.ts', 'lib/journey-plans.ts']
    const declares = (p) => /\bfunction\s+slugify\s*\(/.test(code(p))
    if (!existsSync(SHARED) || !/\bexport\s+function\s+slugify\s*\(/.test(code(SHARED))) {
      console.error('SCAN-1215: lib/utils.ts no longer exports the shared slugify')
      return false
    }
    const copies = tracked('*.ts', '*.tsx').filter((p) => isSource(p) && p !== SHARED && declares(p))
    const pinned = copies.filter((p) => PINNED.includes(p))
    const stray = copies.filter((p) => !PINNED.includes(p))
    console.log(`SCAN-1215: ${copies.length} private slugify cop${copies.length === 1 ? 'y' : 'ies'}: ${pinned.length} pinned (allowed, at most ${PINNED.length}), ${stray.length} stray (allowed 0)`)
    for (const p of pinned) console.log('  pinned: ' + p)
    for (const p of stray) console.error('  stray:  ' + p)
    return stray.length === 0
  },

  // SCAN-1225. The finding: modal dialogs that hand-roll focus handling instead of taking it from
  // the kit (components/ui/dialog, or its hook components/ui/use-dialog-focus-trap). The old check
  // counted every file containing the text role="dialog" or aria-modal, which also counted
  // popovers and side panels that are not modal (role="dialog" with no aria-modal, where a focus
  // trap would be a bug), a selector string, a comment, and the kit itself. It read 20 with the nine
  // conversions of #5029 in, against a ceiling of 10 that converting modals alone could not reach.
  // This one counts only files that render a MODAL: an aria-modal attribute that is not "false",
  // or role="alertdialog", in code (comments stripped, selector strings not matched). A file is
  // off the kit when it imports neither kit module. The ceiling is the row's own: 10.
  // It is per file, so a file with one kit dialog and one hand-rolled modal reads as on the kit.
  'SCAN-1225': () => {
    const CEILING = 10
    const KIT_FILES = ['components/ui/dialog.tsx', 'components/ui/use-dialog-focus-trap.ts']
    const rendersModal = (s) =>
      /[\s{]aria-modal(?!\s*=\s*(?:"false"|'false'|\{\s*false\s*\}))/.test(s) ||
      /['"]aria-modal['"]\s*:\s*(?!false|['"]false['"])/.test(s) ||
      /\srole=(?:"alertdialog"|'alertdialog'|\{\s*['"]alertdialog['"]\s*\})/.test(s)
    const onKit = (s) => /ui\/dialog['"]|use-dialog-focus-trap['"]/.test(s)
    if (!KIT_FILES.every((p) => existsSync(p))) {
      console.error('SCAN-1225: the kit dialog or its focus-trap hook is gone')
      return false
    }
    const modal = tracked('components', 'app').filter((p) => isSource(p) && !KIT_FILES.includes(p) && rendersModal(code(p)))
    const off = modal.filter((p) => !onKit(code(p)))
    console.log(`SCAN-1225: ${modal.length} files write their own modal markup (aria-modal or alertdialog); ${modal.length - off.length} take focus handling from the kit, ${off.length} do not (ceiling ${CEILING})`)
    for (const p of off) console.log('  off the kit: ' + p)
    return off.length <= CEILING
  },

  // SCAN-1213. The finding has two halves: art in public/ is served with no long-lived cache
  // header, and the deploy tree carries 14 MB of music. The old check's first half was a
  // JavaScript syntax error (unbalanced quotes), so it exited 1 whatever the tree held, and what it
  // meant to ask for was wrong twice: a bare `/themes/:path*` rule would cache the HTML pages that
  // share those folders' names for a week, and a `/maplibre/` rule would cache worker files that
  // change in place on a library bump. This one asks the router instead of the source text: it
  // loads next.config.ts the way Next does and reads the Cache-Control each URL is really served.
  //   1. Every tracked file under the five art folders gets a Cache-Control of a week or more.
  //   2. No page beside them gets a Cache-Control from the config.
  //   3. public/tracks is under 1000 KB. This clause is the old check's second half, unchanged in
  //      meaning: the music has not moved out of the repo, so the row stays open on it.
  'SCAN-1213': async () => {
    const WEEK = 604800
    const FOLDERS = ['themes', 'sites', 'themes-index', 'create-a-space', 'screenshots']
    const PAGES = ['/', '/pricing', '/themes', '/themes/nocturne', '/themes/nocturne/demo', '/sites/alli-rae', '/sites/alli-rae/about', '/create-a-space']
    const TRACKS_KB_MAX = 1000

    const req = createRequire(join(process.cwd(), 'package.json'))
    const loadConfig = req('next/dist/server/config').default
    const loadCustomRoutes = req('next/dist/lib/load-custom-routes').default
    const { buildCustomRoute } = req('next/dist/lib/build-custom-route')
    const config = await loadConfig('phase-production-server', process.cwd(), { silent: true })
    const { headers } = await loadCustomRoutes(config)
    const rules = headers.map((h) => ({ re: new RegExp(buildCustomRoute('header', h).regex, 'i'), headers: h.headers }))
    const cacheControl = (url) =>
      rules.filter((r) => r.re.test(url)).flatMap((r) => r.headers.filter((h) => h.key.toLowerCase() === 'cache-control').map((h) => h.value))
    const longLived = (v) => /\bpublic\b/.test(v) && Number(/max-age=(\d+)/.exec(v)?.[1] ?? 0) >= WEEK

    const files = tracked(...FOLDERS.map((f) => 'public/' + f))
    const uncached = files.filter((p) => {
      const got = cacheControl(encodeURI(p.slice('public'.length)))
      return got.length === 0 || !got.every(longLived)
    })
    const emptyFolders = FOLDERS.filter((f) => !files.some((p) => p.startsWith(`public/${f}/`)))
    const cachedPages = PAGES.filter((p) => cacheControl(p).length > 0)
    const tracksKb = Math.ceil(tracked('public/tracks').reduce((n, p) => n + statSync(p).size, 0) / 1024)

    const cacheOk = files.length > 0 && uncached.length === 0 && cachedPages.length === 0
    const treeOk = tracksKb < TRACKS_KB_MAX
    console.log(`SCAN-1213 cache: ${files.length - uncached.length} of ${files.length} art files are served a week or more of cache; ${cachedPages.length} of ${PAGES.length} pages wrongly cached: ${cacheOk ? 'ok' : 'RED'}`)
    for (const p of uncached.slice(0, 20)) console.error('  no long cache: /' + p.slice('public/'.length))
    if (uncached.length > 20) console.error(`  ... and ${uncached.length - 20} more`)
    for (const p of cachedPages) console.error('  page given a cache header: ' + p)
    if (emptyFolders.length) console.log('  (no tracked files, nothing to cache: ' + emptyFolders.map((f) => 'public/' + f).join(', ') + ')')
    console.log(`SCAN-1213 tree: public/tracks is ${tracksKb} KB (must be under ${TRACKS_KB_MAX}): ${treeOk ? 'ok' : 'RED'}`)
    return cacheOk && treeOk
  },

  // SCAN-1226. Three clauses. The first and third are the old check's, unchanged in meaning: the
  // /pricing entry carries lastModified, and llms.txt names the founding towns. The middle one was
  // `! grep 'CIRCLE_SITEMAP_CAP = 200'`, which asked for a constant to change. That constant must
  // stay 200: it is one call's ceiling in the public_circles RPC's own SQL, and older checks
  // (SCAN-203, SCAN-1052, app/sitemap-legacy-readers.test.ts) pin it. The finding is that the
  // sitemap stops naming circles after the first 200. So the middle clause now follows the read:
  //   a. app/sitemap.ts calls a reader it imports from @/lib/discover,
  //   b. whose body in lib/discover.ts loops over an RPC named public_circles*, passing an offset,
  //   c. and a migration defines that RPC with an offset parameter.
  // It is red until a paged read is on the branch. The constant is not read at all.
  'SCAN-1226': () => {
    const SITEMAP = 'app/sitemap.ts'
    const READER = 'lib/discover.ts'
    const sitemap = code(SITEMAP)

    const lastmodOk = /\/pricing[^}]*lastModified/.test(readFileSync(SITEMAP, 'utf8'))
    const townsOk = /\bFOUNDING_CITIES\b/.test(code('app/llms.txt/route.ts'))

    const imported = [...sitemap.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/discover["']/g)]
      .flatMap((m) => m[1].split(','))
      .map((n) => n.trim().split(/\s+as\s+/).pop())
      .filter(Boolean)
    const called = imported.filter((n) => new RegExp('\\b' + n + '\\s*\\(').test(sitemap.replace(/import\s*\{[^}]*\}\s*from\s*["'][^"']*["']/g, '')))
    const reader = code(READER)
    const migrations = tracked('supabase/migrations').filter((p) => p.endsWith('.sql'))
    let paged = null
    for (const name of called) {
      const at = reader.search(new RegExp('export\\s+(?:async\\s+)?function\\s+' + name + '\\b'))
      if (at === -1) continue
      const next = reader.indexOf('\nexport ', at + 1)
      const body = reader.slice(at, next === -1 ? undefined : next)
      const rpc = /\.rpc\(\s*['"](public_circles\w*)['"]\s*,\s*\{[^}]*\b_?offset\b/.exec(body)?.[1]
      if (!rpc || !/\b(?:for|while)\s*\(/.test(body)) continue
      const defined = migrations.some((p) => {
        const sql = readFileSync(p, 'utf8')
        const m = new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?' + rpc + '\\s*\\(([^)]*)\\)', 'i').exec(sql)
        return !!m && /\b_?offset\b/i.test(m[1])
      })
      if (defined) {
        paged = { name, rpc }
        break
      }
    }

    console.log(`SCAN-1226 lastmod on /pricing: ${lastmodOk ? 'ok' : 'RED'}`)
    console.log(
      `SCAN-1226 circles read past the first page: ${
        paged
          ? `ok (${SITEMAP} calls ${paged.name}, which loops over the ${paged.rpc} RPC by offset)`
          : `RED (no reader that ${SITEMAP} calls from ${READER} loops over a public_circles RPC by offset, with a migration that defines it)`
      }`,
    )
    console.log(`SCAN-1226 founding towns in llms.txt: ${townsOk ? 'ok' : 'RED'}`)
    return lastmodOk && !!paged && townsOk
  },
}

const CHECKS = {
  "SCAN-1206": "node -e \"const fs=require('fs');const a=fs.readFileSync('lib/site.ts','utf8');const i=a.indexOf('export const SITE_DESCRIPTION');const d=a.slice(i,a.indexOf(';',i));const h=fs.readFileSync('lib/seo/frequency-pages.ts','utf8');process.exit(/North County/.test(d)||/North County/.test(h.slice(h.indexOf(\\\"path: '/',\\\"),h.indexOf(\\\"path: '/the-community'\\\")))?0:1)\"",
  "SCAN-1207": "node scripts/ledger.mjs view LIVE-BETA-CAMPAIGN-KICKOFF | grep -q 'November 11' && exit 1 || exit 0",
  "SCAN-1208": "node -e \"const fs=require('fs');const t=fs.readFileSync('app/(main)/launch/step/review/page.tsx','utf8');if(!/buildLaunchDraft|readBuildout|loadStoredBuildout/.test(t)&&/TEMPORARY loader/.test(fs.readFileSync('lib/launch/review-io.ts','utf8')))process.exit(1)\"",
  "SCAN-1209": "git grep -qE 'north-county|FOUNDING_CITIES' -- app/sitemap.ts",
  "SCAN-1210": "grep -rlE \"public_events_(snapshot|cache)\" supabase/migrations lib | grep -q .",
  "SCAN-1211": "node -e \"const fs=require('fs');const ids=['space','offer','website','event','circle','journey','people','get-paid'];const miss=ids.filter(i=>!fs.existsSync('app/(main)/launch/step/'+i+'/page.tsx'));if(miss.length){console.error('no page for launch step(s): '+miss);process.exit(1)}\"",
  "SCAN-1212": "git grep -q 'Solana Beach' -- lib/site.ts && node -e \"process.exit(/organizationSchema[\\s\\S]{0,1800}addressLocality/.test(require('fs').readFileSync('lib/jsonld.ts','utf8'))?0:1)\"",
  "SCAN-1214": "test -f docs/security/csp-eval-trace.md",
  "SCAN-1216": "node -e \"process.exit(require('fs').readFileSync('app/(marketing)/start/actions.ts','utf8').includes('rateLimitOk')?0:1)\"",
  "SCAN-1217": "! git grep -qE \"file.type.startsWith\\('image/'\\)\" -- ':(literal)lib/spaces/space-image-store.ts' ':(literal)app/(main)/journeys/actions.ts' ':(literal)app/(main)/events/[slug]/social-actions.ts'",
  "SCAN-1218": "test -f docs/perf/public-cwv-baseline.md",
  "SCAN-1219": "git grep -q launchDraft -- app components lib/spaces lib/sites",
  "SCAN-1220": "git grep -q runSpacePlaybookAction -- app components ':!*playbook-actions*' ':!*.test.*'",
  "SCAN-1221": "git grep -qE 'sendSpaceEmailDraftToRecipients|sendSpaceEmailDraftAsConversations' -- app components ':!*.test.*'",
  "SCAN-1222": "node -e \"const o=require('child_process').execSync('git ls-files -z test/e2e/__screenshots__ | xargs -0 du -ck | tail -1').toString();process.exit(parseInt(o)>50000?1:0)\"",
  "SCAN-1223": "git grep -qiE 'north county' -- lib/marketing/quick-answers.ts app/llms-full.txt/route.ts",
  "SCAN-1224": "test -f docs/security/definer-rpc-review.md",
  "SCAN-1227": "test ! -e MARKETING-BRIEF.md && test ! -e funnels-brief.md && test ! -e claude-design-briefs.md && ! git grep -q COMPLETE -- SEO-AEO-PLAN.md",
  "SCAN-1228": "grep -q 'metadata' 'app/(main)/admin/qr/page.tsx'",
  "SCAN-1229": "git grep -qE 'setTaskPlanning|removeEntryComment|setPlanHold' -- components app ':!*actions.ts' ':!*.test.*'",
  "SCAN-1230": "grep -q SITE_THEME_STYLESHEET_PILOT docs/RUNBOOKS.md && grep -q CRON_HEARTBEAT_SKIP .env.example",
  "SCAN-1231": "sed -n '53,55p' lib/vcard.ts | grep -q '\\\\r'",
  "SCAN-1232": "node -e \"const s=require('fs').readFileSync('app/sign-in/actions.ts','utf8');const i=s.indexOf('async function stashNext');process.exit(s.slice(i,i+400).includes('secure')?0:1)\"",
  "SCAN-1233": "node -e \"const cp=require('child_process'),fs=require('fs');const f=cp.execSync('git ls-files app components').toString().split('\\n').filter(p=>/\\.tsx$/.test(p)&&!/test/.test(p));let n=0;for(const p of f){if(/<Image[^>]*\\spriority(\\s|=|\\/|>)/.test(fs.readFileSync(p,'utf8')))n++}process.exit(n>0?1:0)\"",
  "SCAN-1234": "node -e \"const a=require('./lighthouserc.mobile.json').ci.assert.assertions;process.exit(a['largest-contentful-paint'][0]==='error'?0:1)\"",
  "SCAN-1235": "node -e \"const s=require('fs').readFileSync('lib/spaces/memberships.ts','utf8');const i=s.indexOf('listMyPastDueSpaceMemberships');process.exit(/for \\(const row of data[\\s\\S]{0,300}await getSpaceById/.test(s.slice(i,i+2500))?1:0)\"",
  "SCAN-1236": "node -e \"const cp=require('child_process'),fs=require('fs');const a=(fs.readFileSync('lib/theme/skins.ts','utf8').match(/label: 'Midnight'/g)||[]).length;const g=cp.execSync('git grep -l \\\"#4285F4\\\" -- app components || true').toString().split('\\n').filter(Boolean).length;process.exit(a>1||g>1?1:0)\"",
  "SCAN-1237": "node -e \"const s=require('fs').readFileSync('proxy.ts','utf8');process.exit(/%5C|%5c/.test(s)?0:1)\"",
  "SCAN-1238": "node -e \"const fs=require('fs');const dir='supabase/migrations/';const hit=fs.readdirSync(dir).some(f=>/drop table[^;]*zz_backup_/i.test(fs.readFileSync(dir+f,'utf8')));process.exit(hit?0:1)\"",
  "SCAN-1239": "(grep -q rateLimitOk app/api/csp-report/route.ts && grep -q rateLimitOk app/api/status/queue-lag/route.ts) && (grep -q rateLimitOk app/api/track/route.ts && grep -q rateLimitOk app/api/observe/route.ts) && (test $(grep -l FLOWWEB_OUTCOMES_SECRET app/api/webhooks/*/route.ts | wc -l) -le 1) && (grep -rq rateLimitConfigured .github/workflows)",
  "SCAN-1240": "(test ! -e components/frequency/site/pages/shared/wired-in.tsx -a ! -e components/marketplace/etsy-preview.tsx -a ! -e components/sites/temple-kit-inner/pages-e.ts) && (git grep -lE \"components/spaces/dashboard/space-dashboard'\" -- app components lib ':!*.test.*' | grep -q .) && (test ! -e scripts/space-email-program.test.mjs) && (test ! -e public/images/site/downward-dog.jpg -a ! -e public/images/site/outdoor-yoga.jpg -a ! -e public/images/site/kundalini-group-outdoor.jpg)",
  "SCAN-1241": "(test $(git grep -E 'function (money|formatPrice|formatMoney)\\(' -- 'app' 'components' 'lib' ':!*.test.*' | wc -l) -le 2) && (test $(git grep -E 'toLocale(Date|Time)String' -- 'app' 'components' ':!*.test.*' | wc -l) -le 100)",
  "SCAN-1242": "(node -e \"const b=require('./scripts/adoption-baselines.json');const e=(b.entries||b);const x=(Array.isArray(e)?e:Object.values(e)).find(k=>k.key==='raw-input');process.exit(x.baseline<=60?0:1)\") && (test $(git grep -c '<button' -- 'app/join/(induction)/induction.tsx' | cut -d: -f2) -le 5) && (test $(grep -v '^#' scripts/templates-baseline.txt | grep -c .) -le 40)",
  "SCAN-1243": "! grep -qE \"script-src 'self' 'unsafe-inline'\" next.config.ts"
}

const id = process.argv[2]
const rewritten = REWRITTEN[id]
if (rewritten) {
  let ok = false
  try {
    ok = (await rewritten()) === true
  } catch (e) {
    console.error(id + ': the check itself threw, which counts as red: ' + (e?.stack ?? e))
  }
  process.exit(ok ? 0 : 1)
}
const cmd = CHECKS[id]
if (!cmd) {
  console.error('unknown audit row: ' + id)
  process.exit(2)
}
const r = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' })
process.exit(r.status ?? 1)

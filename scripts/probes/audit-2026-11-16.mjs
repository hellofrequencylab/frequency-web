// Probes for the 2026-11-16 whole-site audit rows (SCAN-1206..SCAN-1243). Each row's verify cmd is
// `node scripts/probes/audit-2026-11-16.mjs <ROW-ID>`; the check for that row runs below and exits 0 only
// when the finding is fixed. They are direction checks written by the audit: they fail today by design.
// A row's own fix may retime its check only with the owner's phrase for that row.
import { spawnSync } from 'node:child_process'

const CHECKS = {
  "SCAN-1206": "node -e \"const fs=require('fs');const a=fs.readFileSync('lib/site.ts','utf8');const i=a.indexOf('export const SITE_DESCRIPTION');const d=a.slice(i,a.indexOf(';',i));const h=fs.readFileSync('lib/seo/frequency-pages.ts','utf8');process.exit(/North County/.test(d)||/North County/.test(h.slice(h.indexOf(\\\"path: '/',\\\"),h.indexOf(\\\"path: '/the-community'\\\")))?0:1)\"",
  "SCAN-1207": "node scripts/ledger.mjs view LIVE-BETA-CAMPAIGN-KICKOFF | grep -q 'November 11' && exit 1 || exit 0",
  "SCAN-1208": "node -e \"const fs=require('fs');const t=fs.readFileSync('app/(main)/launch/step/review/page.tsx','utf8');if(!/buildLaunchDraft|readBuildout|loadStoredBuildout/.test(t)&&/TEMPORARY loader/.test(fs.readFileSync('lib/launch/review-io.ts','utf8')))process.exit(1)\"",
  "SCAN-1209": "rg -c \"north-county|FOUNDING_CITIES\" app/sitemap.ts | grep -qv '^0$' && echo PASS || (echo FAIL; exit 1)",
  "SCAN-1210": "grep -rlE \"public_events_(snapshot|cache)\" supabase/migrations lib | grep -q .",
  "SCAN-1211": "node -e \"const fs=require('fs');const ids=['space','offer','website','event','circle','journey','people','get-paid'];const miss=ids.filter(i=>!fs.existsSync('app/(main)/launch/step/'+i+'/page.tsx'));if(miss.length){console.error('no page for launch step(s): '+miss);process.exit(1)}\"",
  "SCAN-1212": "(rg -c 'Solana Beach' lib/site.ts | grep -qv '^0$') && (rg -c 'addressLocality' lib/jsonld.ts | head -1; node -e \"process.exit(/organizationSchema[\\s\\S]{0,1800}addressLocality/.test(require('fs').readFileSync('lib/jsonld.ts','utf8'))?0:1)\")",
  "SCAN-1213": "(node -e \"const s=require('fs').readFileSync('next.config.ts','utf8');process.exit(['/sites/','/themes/','/maplibre/'].every(p=>s.includes(\\\"'\\\"+p+':path*'\\\"))?0:1)\") && (test $(du -sk public/tracks | cut -f1) -lt 1000)",
  "SCAN-1214": "echo manual: Vercel env UNSUBSCRIBE_SECRET present in production && exit 1",
  "SCAN-1215": "test $(git grep -E 'function slugify\\(' -- '*.ts' '*.tsx' ':!*.test.*' ':!mobile' | wc -l) -le 1",
  "SCAN-1216": "node -e \"process.exit(require('fs').readFileSync('app/(marketing)/start/actions.ts','utf8').includes('rateLimitOk')?0:1)\"",
  "SCAN-1217": "! rg -q \"file.type.startsWith\\('image/'\\)\" lib/spaces/space-image-store.ts 'app/(main)/journeys/actions.ts' 'app/(main)/events/[slug]/social-actions.ts'",
  "SCAN-1218": "test -f docs/perf/public-cwv-baseline.md",
  "SCAN-1219": "rg -q 'launchDraft' app components lib/spaces lib/sites",
  "SCAN-1220": "rg -q 'runSpacePlaybookAction' app components --glob '!*playbook-actions*' --glob '!*.test.*'",
  "SCAN-1221": "rg -q 'sendSpaceEmailDraftToRecipients|sendSpaceEmailDraftAsConversations' app components --glob '!*.test.*'",
  "SCAN-1222": "node -e \"const o=require('child_process').execSync('git ls-files -z test/e2e/__screenshots__ | xargs -0 du -ck | tail -1').toString();process.exit(parseInt(o)>50000?1:0)\"",
  "SCAN-1223": "rg -il 'north county' lib/marketing/quick-answers.ts app/llms-full.txt/route.ts | wc -l | grep -qv '^0$'",
  "SCAN-1224": "test -f docs/security/definer-rpc-review.md",
  "SCAN-1225": "test $(for f in $(git grep -lE 'role=\"dialog\"|aria-modal' -- components app ':!*.test.*'); do grep -qE 'ui/dialog|use-dialog-focus-trap' $f || echo $f; done | wc -l) -le 10",
  "SCAN-1226": "(node -e \"const s=require('fs').readFileSync('app/sitemap.ts','utf8');process.exit(/\\/pricing[^}]*lastModified/.test(s)?0:1)\") && (rg -c 'CIRCLE_SITEMAP_CAP = 200' app/sitemap.ts | grep -qv '^1$') && (rg -c 'FOUNDING_CITIES' app/llms.txt/route.ts | grep -qv '^0$')",
  "SCAN-1227": "(test ! -e MARKETING-BRIEF.md -a ! -e funnels-brief.md -a ! -e claude-design-briefs.md) && (rg -c 'COMPLETE' SEO-AEO-PLAN.md | grep -q '^0$') && (! grep -q 'sync DAWN' CLAUDE.md)",
  "SCAN-1228": "grep -q 'metadata' 'app/(main)/admin/qr/page.tsx'",
  "SCAN-1229": "rg -q 'setTaskPlanning|removeEntryComment|setPlanHold' components app --glob '!*actions.ts' --glob '!*.test.*'",
  "SCAN-1230": "grep -q SITE_THEME_STYLESHEET_PILOT docs/RUNBOOKS.md && grep -q CRON_HEARTBEAT_SKIP .env.example",
  "SCAN-1231": "sed -n '53,55p' lib/vcard.ts | grep -q '\\\\r'",
  "SCAN-1232": "node -e \"const s=require('fs').readFileSync('app/sign-in/actions.ts','utf8');const i=s.indexOf('async function stashNext');process.exit(s.slice(i,i+400).includes('secure')?0:1)\"",
  "SCAN-1233": "rg -n --glob '*.tsx' --glob '!*test*' '\\bpriority(=\\{[^}]*\\}|\\s|/)' components app | rg -c 'Image|priority$|priority\\s' | awk '{exit ($1>0)}'",
  "SCAN-1234": "node -e \"const a=require('./lighthouserc.mobile.json').ci.assert.assertions;process.exit(a['largest-contentful-paint'][0]==='error'?0:1)\"",
  "SCAN-1235": "node -e \"const s=require('fs').readFileSync('lib/spaces/memberships.ts','utf8');const i=s.indexOf('listMyPastDueSpaceMemberships');process.exit(/for \\(const row of data[\\s\\S]{0,300}await getSpaceById/.test(s.slice(i,i+2500))?1:0)\"",
  "SCAN-1236": "(rg -c \"label: 'Midnight'\" lib/theme/skins.ts | awk '{exit ($1>1)}') && (rg -l '#4285F4' app components | wc -l | awk '{exit ($1>1)}')",
  "SCAN-1237": "node -e \"const s=require('fs').readFileSync('proxy.ts','utf8');process.exit(/%5C|%5c/.test(s)?0:1)\"",
  "SCAN-1238": "rg -q 'zz_backup_' supabase/migrations/*drop* 2>/dev/null",
  "SCAN-1239": "(grep -q rateLimitOk app/api/csp-report/route.ts && grep -q rateLimitOk app/api/status/queue-lag/route.ts) && (grep -q rateLimitOk app/api/track/route.ts && grep -q rateLimitOk app/api/observe/route.ts) && (test $(grep -l FLOWWEB_OUTCOMES_SECRET app/api/webhooks/*/route.ts | wc -l) -le 1) && (grep -rq rateLimitConfigured .github/workflows)",
  "SCAN-1240": "(test ! -e components/frequency/site/pages/shared/wired-in.tsx -a ! -e components/marketplace/etsy-preview.tsx -a ! -e components/sites/temple-kit-inner/pages-e.ts) && (git grep -lE \"components/spaces/dashboard/space-dashboard'\" -- app components lib ':!*.test.*' | grep -q .) && (test ! -e scripts/space-email-program.test.mjs) && (test ! -e public/images/site/downward-dog.jpg -a ! -e public/images/site/outdoor-yoga.jpg -a ! -e public/images/site/kundalini-group-outdoor.jpg)",
  "SCAN-1241": "(test $(git grep -E 'function (money|formatPrice|formatMoney)\\(' -- 'app' 'components' 'lib' ':!*.test.*' | wc -l) -le 2) && (test $(git grep -E 'toLocale(Date|Time)String' -- 'app' 'components' ':!*.test.*' | wc -l) -le 100)",
  "SCAN-1242": "(node -e \"const b=require('./scripts/adoption-baselines.json');const e=(b.entries||b);const x=(Array.isArray(e)?e:Object.values(e)).find(k=>k.key==='raw-input');process.exit(x.baseline<=60?0:1)\") && (test $(git grep -c '<button' -- 'app/join/(induction)/induction.tsx' | cut -d: -f2) -le 5) && (test $(grep -v '^#' scripts/templates-baseline.txt | grep -c .) -le 40)",
  "SCAN-1243": "! grep -qE \"script-src 'self' 'unsafe-inline'\" next.config.ts"
}

const id = process.argv[2]
const cmd = CHECKS[id]
if (!cmd) {
  console.error('unknown audit row: ' + id)
  process.exit(2)
}
const r = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' })
process.exit(r.status ?? 1)

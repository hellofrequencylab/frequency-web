#!/usr/bin/env node
// The funnel and onboarding audit of 2026-11-27 (project thread "Audit funnels and onboarding for Fergal";
// doc https://claude.ai/artifact/K6WJF8sPmATEFjjDNCr3sh). One probe per row:
// `node scripts/probes/funnel-audit-2026-11-27.mjs <ID>`. Each checks the consequence its row names in the
// code a visitor or member actually runs through. Exit 1 (FAIL) while the gap stands.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const raw = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
const code = (p) =>
  raw(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const dir = (p) => (has(p) ? readdirSync(new URL(p, root)).map((f) => `${p}/${f}`) : [])
const codeOf = (paths) => paths.map(code).join('\n')
/** Every non-test .ts/.tsx file under a folder. */
const walk = (p) =>
  has(p)
    ? readdirSync(new URL(p, root), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${p}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [`${p}/${e.name}`] : [],
      )
    : []
/** The body of one exported function, from its signature to the next top-level export. */
const fnBody = (src, name) => {
  const i = src.indexOf(`export async function ${name}`)
  if (i < 0) return ''
  const j = src.indexOf('\nexport ', i + 1)
  return src.slice(i, j < 0 ? undefined : j)
}

const LYB_ACTIONS = 'app/(marketing)/launch-your-business/actions.ts'
const FB_ACTIONS = 'lib/feature-builder/actions.ts'

const PROBES = {
  // A builder sign-up keeps working once the bot check is switched on: both email claims forward the token
  // and both claim forms render the widget.
  'SCAN-1360': () => {
    const f = []
    for (const p of [LYB_ACTIONS, FB_ACTIONS])
      if (!/BOT_CHECK_FIELD|botCheckToken/.test(code(p))) f.push(`${p}: the email claim sends no bot-check token, so it fails once NEXT_PUBLIC_TURNSTILE_SITE_KEY is set`)
    for (const p of ['components/frequency/site/pages/create-space/create-space-claim.tsx', 'components/frequency/site/pages/feature-builder/feature-studio.tsx'])
      if (!/<BotCheck\b/.test(code(p))) f.push(`${p}: the claim form renders no BotCheck`)
    return f
  },
  // A new account made outside the /join induction still gets its first touch and its referral credit.
  'SCAN-1361': () => {
    const seams = codeOf(['app/auth/callback/route.ts', 'app/(main)/launch/claim/route.ts', ...dir('lib/auth').filter((p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p))])
    const f = []
    if (!/persistAcquisition/.test(seams)) f.push('only the /join induction persists first-touch acquisition; builder and /sign-in sign-ups keep none')
    if (!/applyReferralAttribution/.test(seams)) f.push('only the /join induction credits a scanned referral')
    return f
  },
  // A /pricing plan button carries the chosen plan through to the builder, signed in or out.
  'SCAN-1362': () => {
    const f = []
    if (!/['"]plan['"]/.test(code('lib/create-space/door.ts'))) f.push('lib/create-space/door.ts never reads ?plan=, so a signed-out Business click lands on a free Space')
    if (!/new URLSearchParams\(\{[^)]*\bplan\b/.test(code('app/(main)/spaces/new/page.tsx'))) f.push('/spaces/new rebuilds the /launch/start query without the plan')
    return f
  },
  // The bare /join magic link carries its funnel, so a link opened in another browser finishes the induction.
  'SCAN-1363': () =>
    /funnel_seq|pending_induction/.test(fnBody(code('app/sign-in/actions.ts'), 'sendSignupLink'))
      ? []
      : ['sendSignupLink stamps no funnel on the account, so a /join link opened in another browser lands on /feed with the answers lost'],
  // Every registered lifecycle email, and the Vera owner brief, goes through the 1-a-day / 3-a-week cap.
  'SCAN-1364': () => {
    const reg = raw('lib/lifecycle/registry.ts')
    const all = codeOf([...walk('lib'), ...walk('app')])
    const f = []
    for (const m of reg.matchAll(/kind:\s*'(\w+)'[^\n]*?file:\s*'([^']+)'/g)) {
      const [, kind, file] = m
      const capped =
        new RegExp(`reserveLifecycleSend\\([^)]*kind:\\s*'${kind}'`).test(all) ||
        (kind === 'campaign' && /reserveLifecycleSend/.test(code('lib/email-studio/campaign-cap.ts')))
      if (!capped) f.push(`${kind} (${file}) sends without the lifecycle cap`)
    }
    if (!/reserveLifecycleSend/.test(code('lib/ai/vera/owner-brief.ts'))) f.push('the daily Vera owner brief sends without the lifecycle cap')
    return f
  },
  // The 150 Founding Year seats cannot be oversold by checkout sessions opened before the last seat went.
  'SCAN-1365': () =>
    /expires_at/.test(code('lib/billing/space-plan-checkout.ts')) || /seatCap/.test(code('lib/billing/founding-year-record.ts'))
      ? []
      : ['the seat cap is read only when the checkout session opens; open sessions can all complete past seat 150'],
  // A Space plan checkout start and a trial start are both counted.
  'SCAN-1366': () => {
    const f = []
    const billing = codeOf(['lib/billing/space-plan-checkout.ts', ...dir('app/(main)/spaces/[slug]/settings/billing').filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p))])
    if (!/checkout_started/.test(billing)) f.push('a Space plan Upgrade click records no checkout_started')
    if (!/no_payment_required/.test(code('lib/analytics/purchase.ts')) && !/\btrack\(/.test(code('lib/billing/space-subscriptions.ts')))
      f.push('a Space plan trial start records no event (purchase conversion needs payment_status paid)')
    return f
  },
  // Vera's autonomous sends stay held until the owner's date in code, not only behind an admin toggle.
  'SCAN-1367': () =>
    /AUTONOMY_NOT_BEFORE/.test(codeOf([...dir('lib/ai/vera').filter((p) => /\.ts$/.test(p)), 'lib/platform-flags.ts']))
      ? []
      : ['the "autonomous sends held to Feb 2027" rule lives nowhere in code; one admin flag flip opens them'],
  // A quick-builder draft survives a magic link opened in another browser, and the builders are measured.
  'SCAN-1368': () => {
    const f = []
    if (!/create_space_drafts|feature_drafts|saveDraft/.test(codeOf(dir('lib/feature-builder').filter((p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p)))))
      f.push('the four quick builders keep their draft only in the fq_feature_hold cookie')
    if (!/SIGNAL_URL|trackClient|sendBeacon/.test(codeOf(dir('components/frequency/site/pages/feature-builder')))) f.push('the four quick builders emit no events')
    return f
  },
  // The operator comparison pages offer the Space path, not only "find a Circle".
  'SCAN-1369': () =>
    /\/spaces\/new|\/launch-your-business|createSpace|OPERATOR_CTA|HOST_CTA/.test(code('components/frequency/site/pages/funnel/frequency-compare.tsx'))
      ? []
      : ['/vs pages (read by operators comparing tools) only send people to /discover'],
  // FlowWeb links keep their source in GA4.
  'SCAN-1370': () =>
    /flowweb\//.test(code('lib/analytics/sanitize.ts')) ? [] : ['the GA4 page_location allowlist drops utm_source=flowweb, so FlowWeb traffic reads as direct or referral'],
  // The welcome email cannot go out twice for one member.
  'SCAN-1371': () =>
    /dedupeKey/.test(fnBody(code('lib/email.ts'), 'sendWelcomeEmail')) ? [] : ['sendWelcomeEmail queues with no dedupeKey; both induction finishers can send it'],
  // The first emails every person gets (confirm, magic link, reset) live in the repo where they can be reviewed.
  'SCAN-1372': () => {
    const f = []
    if (!has('supabase/templates/magic_link.html')) f.push('no supabase/templates/magic_link.html; auth email copy lives only in the dashboard')
    if (!/^\s*content_path\s*=/m.test(raw('supabase/config.toml'))) f.push('supabase/config.toml points no auth email at a template file')
    return f
  },
  // A new /start lead who ticks the box gets a confirm email, so persona nurture can start.
  'SCAN-1373': () =>
    /requestOptin|sendOptinConfirmEmail/.test(code('app/(marketing)/start/actions.ts')) ? [] : ['a new /start lead is never asked to confirm, so it never reaches its persona nurture'],
  // Nothing the pixels receive can carry Space intents, and every gtag call passes the guard.
  'SCAN-1374': () => {
    const f = []
    if (!/['"]intents['"]/.test(code('lib/analytics/sanitize.ts'))) f.push('createspace.offer sends intents to GA4; intents is not a denied pixel key')
    if (!/pixelSafeProps/.test(code('lib/how/brief-tracker.ts'))) f.push('lib/how/brief-tracker.ts calls gtag without pixelSafeProps')
    return f
  },
  // Each FlowWeb hook caps the body it reads before checking the signature.
  'SCAN-1375': () =>
    ['crm', 'link', 'outcomes']
      .map((h) => `app/api/webhooks/flowweb-${h}/route.ts`)
      .filter((p) => {
        const s = code(p)
        const cap = s.search(/MAX_\w*BYTES|content-length/i)
        const read = s.indexOf('req.text()')
        return read >= 0 && (cap < 0 || cap > read)
      })
      .map((p) => `${p} reads the whole body before any size cap`),
  // Operator day 1, 3 and 7 emails wait for a reasonable local hour, as the come-backs do.
  'SCAN-1376': () =>
    /hourInZone|inSendWindow/.test(code('lib/marketing/operator-lifecycle.ts')) ? [] : ['operator day 1/3/7 emails go out at 00:00 UTC (late afternoon Pacific, night elsewhere) with no local-hours window'],
  // The course sales page reads its run dates from the events, so it cannot go stale after the first session.
  'SCAN-1377': () =>
    /January 7/.test(code('components/frequency/site/pages/courses/business-of-community.tsx'))
      ? ['The Business of Community page types "Starts January 7" by hand; it keeps saying so after the run starts']
      : [],
  // The docs a new engineer reads first describe the funnels the code runs.
  'SCAN-1378': () => {
    const f = []
    if (/\/join\?seq=/.test(raw('lib/marketing/funnel-config.ts'))) f.push('lib/marketing/funnel-config.ts still says niche doors build /join?seq=; they go to /spaces/new?mode=')
    if (/onboarding\.step_viewed/.test(raw('docs/ANALYTICS.md'))) f.push('docs/ANALYTICS.md lists events lib/analytics/events.ts does not have')
    return f
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`usage: node scripts/probes/funnel-audit-2026-11-27.mjs <${Object.keys(PROBES).join('|')}>`)
  process.exit(2)
}
const failures = probe()
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${id}: ${f}`)
  process.exit(1)
}
console.log(`PASS ${id}`)

#!/usr/bin/env node
// The Space function scan of 2026-11-17 (project thread "Trace every Space feature end to end"). One probe per
// open finding: `node scripts/probes/space-scan-2026-11-17.mjs <ID>`. Each reads source with comments stripped
// and checks the consequence the row names. Exit 1 (FAIL) while the defect stands.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
/** The body of one exported function, up to the next top-level export. */
function fn(src, name) {
  const at = src.search(new RegExp(`export (async )?function ${name}\\(`))
  if (at < 0) return ''
  const next = src.indexOf('\nexport ', at + 10)
  return src.slice(at, next < 0 ? undefined : next)
}

const PROBES = {
  // Spotlight: the owner's own link list (the Links block, what a link-in-bio is) counts presses like Link cards.
  'LIVE-2327': () => {
    const f = []
    const clicks = read('lib/spaces/spotlight-clicks.ts')
    const target = clicks.match(/const TARGET = (\/.*\/)/)?.[1] ?? ''
    if (!/link/.test(target)) f.push('the click endpoint refuses any Links block target (TARGET admits only book, contact and card kinds)')
    const view = read('components/entity-blocks/content-block-view.tsx')
    const links = view.slice(view.indexOf("case 'links':"), view.indexOf("case 'image':"))
    if (!/Counted|beacon|sendBeacon/.test(links)) f.push('the Links block renders plain anchors that send no press')
    return f
  },
  // Payouts: a connected account's capability changes reach the profile without the Connect-scoped webhook.
  'LIVE-2328': () => {
    const crons = readdirSync(new URL('app/api/cron/', root), { recursive: true })
      .filter((p) => String(p).endsWith('route.ts'))
      .map((p) => read(`app/api/cron/${p}`))
    return crons.some((s) => /syncConnectedAccount|persistAccount/.test(s))
      ? []
      : ['no cron re-reads connected accounts, and production has no STRIPE_CONNECT_WEBHOOK_SECRET, so account.updated never lands']
  },
  // Email: a Space campaign is claimed before it sends, so two tabs or Send now racing the cron cannot send twice.
  'LIVE-2329': () => {
    const f = []
    for (const [file, name, send] of [
      ['lib/spaces/email-drafts.ts', 'sendSpaceEmailDraft', 'sendViaSeam('],
      ['lib/spaces/campaigns.ts', null, null],
    ]) {
      const src = read(file)
      const body = name ? fn(src, name) : src
      const cut = send ? body.indexOf(send) : body.length
      if (!/status: 'sending'/.test(body.slice(0, cut))) f.push(`${file}${name ? ` ${name}` : ''} sends without first claiming the row as 'sending'`)
    }
    return f
  },
  // Launch: the come-back email link brings a member whose session expired to sign in and back, not to an empty wizard.
  'LIVE-2330': () => {
    const f = []
    const mail = read('lib/launch/comeback-email.ts')
    if (/\$\{parts\.baseUrl\.replace\(\/\\\/\+\$\/, ''\)\}\/launch`/.test(mail)) f.push('the come-back email links the bare /launch, which proxy.ts sends a signed-out visitor to the empty Create a Space wizard')
    const resume = read('app/(main)/launch/resume/route.ts')
    if (/redirect\('\/sign-in'\)/.test(resume)) f.push('/launch/resume sends a signed-out visitor to /sign-in with no next, so they never come back to their launch')
    return f
  },
  // Create a Space: the Google claim says why it stopped, as the email claim does.
  'LIVE-2331': () => {
    const src = read('app/(marketing)/launch-your-business/actions.ts')
    return /redirect\('\/create-a-space#get-started'\)/.test(src)
      ? ['claimWithGoogle drops a refused hand-over (handle taken, draft lost) back on the form with no message']
      : []
  },
  // Network client websites: a badge or removal change refreshes the client's live site.
  'LIVE-2332': () => {
    const src = read('lib/collective/client-sites-actions.ts')
    return ['toggleClientSiteBadge', 'removeClientSite']
      .filter((n) => !/refreshSite\(/.test(fn(src, n)))
      .map((n) => `${n} changes the client Space and never calls refreshSite, so the live site stays stale`)
  },
  // Page editor: a thrown publish (network or server) ends in Retry, not a button stuck on Publishing.
  'LIVE-2333': () => {
    const src = read('components/spaces/space-landing-editor.tsx')
    const pub = src.slice(src.indexOf('async function handlePublish'), src.indexOf('const label'))
    return /try \{/.test(pub) ? [] : ['handlePublish awaits the server action with no try, so a thrown call leaves the button on Publishing']
  },
  // Spotlight console: a save writes only its own preference keys, so a publish and an autosave cannot undo each other.
  'LIVE-2334': () => {
    const src = read('app/(main)/spaces/[slug]/manage/spotlight/actions.ts')
    return /from\('spaces'\)\s*\.update\([\s\S]{0,200}?\{ preferences/.test(src)
      ? ['the Spotlight console writes the whole spaces.preferences blob from a snapshot (use patchSpacePreferences or set_space_preferences)']
      : []
  },
  // Analytics: the console moments a creator reaches after launch are counted.
  'LIVE-2335': () => {
    const src = read('lib/analytics/events.ts')
    return ['space.spotlight_published', 'space.website_published', 'space.campaign_sent']
      .filter((n) => !src.includes(`name: '${n}'`))
      .map((n) => `${n} is not a registered analytics event`)
  },
  // Email: "Send to picked people as conversations" claims the draft before it sends, so a double press or a
  // second tab cannot open every conversation twice, and a claim that died part way can be taken again.
  'LIVE-2346': () => {
    const f = []
    const src = read('lib/spaces/email-drafts.ts')
    const body = fn(src, 'sendSpaceEmailDraftAsConversations')
    if (!body) return ['sendSpaceEmailDraftAsConversations is gone from lib/spaces/email-drafts.ts (re-check this probe)']
    const cut = body.indexOf('startConversationMessage(')
    const before = body.slice(0, cut < 0 ? body.length : cut)
    const claim = before.match(/\.update\(\{ status: 'sending'[\s\S]*?\.maybeSingle\(\)/)?.[0] ?? ''
    if (!claim) f.push("it opens conversations without first claiming the draft as 'sending'")
    else {
      if (!/\.(in|or|eq)\(/.test(claim.replace(/\.eq\('(id|space_id)'/g, ''))) f.push('the claim is not conditional on the row still being sendable')
      if (!/sendableOrStaleFilter\(\)/.test(claim) || !/sending_started_at\.lt\./.test(src)) f.push("a claim left in 'sending' by a dead send can never be taken again")
    }
    if (!/claim !== 'claimed'\)\s*return fail/.test(before)) f.push('a lost claim does not stop the send')
    if (!/releaseClaim\(id, spaceId/.test(body.slice(cut))) f.push('a send that reached nobody keeps the draft stuck in sending')
    return f
  },
}

const id = process.argv[2]
if (!PROBES[id]) {
  console.error(`usage: space-scan-2026-11-17.mjs <${Object.keys(PROBES).join('|')}>`)
  process.exit(2)
}
for (const p of ['lib/spaces/spotlight-clicks.ts']) if (!has(p)) { console.error(`${p} missing (re-check this probe)`); process.exit(2) }
const fails = PROBES[id]()
if (fails.length) {
  console.error(`${id} FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log(`${id} ok`)

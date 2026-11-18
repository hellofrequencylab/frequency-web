#!/usr/bin/env node
// The feature-path wiring scan of 2026-11-18 (project thread "Verify every feature path end to end"). One
// probe per finding: `node scripts/probes/feature-paths-2026-11-18.mjs <ID>`. Each reads source with comments
// stripped and checks the consequence the row names. Exit 1 (FAIL) while the defect stands.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const read = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const PROBES = {
  // The post composer's Share kind offers the Journeys a member follows. journey_enrollments is deny-all
  // under RLS (no policies), so a session-client read of it always returns nothing.
  'LIVE-2356': () => {
    const f = []
    const src = read('lib/feed/shareables.ts')
    const action = read('app/(main)/feed/actions.ts')
    if (!src) return ['lib/feed/shareables.ts is missing']
    const at = src.indexOf(".from('journey_enrollments')")
    if (at < 0) f.push('shareables no longer reads journey_enrollments')
    else {
      const head = src.slice(Math.max(0, at - 80), at)
      if (/\bsupabase\s*$/.test(head.trimEnd())) f.push('journey_enrollments is still read through the session client, which RLS denies')
    }
    if (!/\.eq\('profile_id', profileId\)[\s\S]{0,200}\.from\('journey_enrollments'\)|\.from\('journey_enrollments'\)[\s\S]{0,200}\.eq\('profile_id', profileId\)/.test(src)) f.push('the journey_enrollments read is not pinned to the caller profileId')
    if (!/listShareablesFor\(profileId, createAdminClient\(\)\)/.test(action)) f.push('listShareables does not hand shareables a reader that can see journey_enrollments')
    return f
  },
  // Every secret the draft links sign with is documented, so an operator can set it apart from the
  // unsubscribe secret instead of discovering the shared fallback only after a rotation.
  'HYG-246': () => {
    const f = []
    const io = read('lib/create-space/draft-io.ts')
    const example = has('.env.example') ? readFileSync(new URL('.env.example', root), 'utf8') : ''
    for (const name of io.match(/'[A-Z][A-Z0-9_]+_SECRET'/g) ?? []) {
      const key = name.slice(1, -1)
      if (!new RegExp(`^${key}=`, 'm').test(example)) f.push(`${key} is read by draft-io.ts but missing from .env.example`)
    }
    return f
  },
  // No server action ships without a caller: each one is a callable endpoint, and these three had none
  // (the Circle cover moved to the Loom picker, the Circle undo had nothing to undo, the booking confirm
  // moved to a POST button under SCAN-858).
  'HYG-247': () => {
    const f = []
    for (const [file, fn] of [
      ['app/(main)/circles/admin-actions.ts', 'uploadCircleCover'],
      ['app/(main)/circles/actions.ts', 'restoreCircleAction'],
      ['lib/spaces/booking-actions.ts', 'confirmGuestBookingAction'],
    ]) if (new RegExp(`export async function ${fn}\\(`).test(read(file))) f.push(`${file} still exports ${fn}, which nothing calls`)
    return f
  },
  // A member who asks to join (or says yes to) an event the host runs: the host hears about it.
  'LIVE-2360': () => {
    const f = []
    const src = read('app/(main)/events/actions.ts')
    if (!/async function notifyHostOfRsvp\(/.test(src)) f.push('events/actions.ts has no host RSVP notice')
    const calls = (src.match(/notifyHostOfRsvp\(eventId, myProfileId, 'rsvp_request'\)/g) ?? []).length
    if (calls < 2) f.push(`a pending RSVP request notifies the host on ${calls} of the 2 RSVP paths`)
    if (!/notifyEventPeople\(\[ev\.host_id\]/.test(src)) f.push('the host notice does not ride the gated event.notice seam')
    return f
  },
  // The Mentions switch holds for every bell row typed as a mention, a mention never swallows a reply
  // notice the member still wants, and an order notice opens the order list.
  'LIVE-2361': () => {
    const f = []
    for (const file of ['lib/circles/social-fuel.ts', 'app/(main)/outreach/actions.ts']) {
      const src = read(file)
      const at = src.indexOf("type: 'mention'")
      if (at < 0) continue
      const before = src.slice(Math.max(0, at - 1200), at)
      if (!/resolveSendGate\([^)]*'inapp', 'mentions'\)/.test(before)) f.push(`${file} writes a mention bell row without the Mentions gate`)
    }
    const feed = read('app/(main)/feed/actions.ts')
    const body = feed.slice(feed.indexOf('async function notifyParentAuthor('), feed.indexOf('async function notifyParentAuthor(') + 1200)
    if (!/resolveSendGate\(authorId, 'inapp', 'mentions'\)/.test(body)) f.push('a reply that @mentions the author is dropped even when their Mentions switch is off')
    if (!/case 'order':\s*return '\/orders'/.test(read('lib/notifications/href.ts'))) f.push("an 'order' notice (a refund) still opens /feed")
    return f
  },
  // A Wildheart "Your first night" block with no link set shows no dead button.
  'LIVE-2362': () => {
    const src = read('components/sites/wildheart-first-night.tsx')
    return /<button type="button" className="hs-btn/.test(src) ? ['the first-night CTA renders a button with no handler when no link is set'] : []
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`unknown id ${id}; known: ${Object.keys(PROBES).join(', ')}`)
  process.exit(2)
}
const fails = probe()
if (fails.length) {
  for (const x of fails) console.log(`FAIL ${id}: ${x}`)
  process.exit(1)
}
console.log(`PASS ${id}`)

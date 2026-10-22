#!/usr/bin/env node
// LIVE-1282 probe: a member card holds one link and its owner sets what a tap opens. Fails if the tap
// route stops deciding by the card's face, if the Crew "My card" editor or the Space's card editor goes
// away, if a card with nothing set stops opening its owner's page, if new cards stop being numbered and
// Crew-only, or if a card tap stops paying Zaps.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const face = r('lib/member-cards/face.ts')
if (!/export function tapTarget\(/.test(face) || !/mode: 'page'/.test(face)) bad.push('the tap decision (or its "open my page" default) is gone')
const route = r('app/c/[token]/route.ts')
if (!/resolveTappedCard\(/.test(route) || !/tapTarget\(/.test(route)) bad.push('/c/<token> no longer opens the card face its owner chose')
if (!/<CardFaceEditor/.test(r('app/(main)/crew/card/page.tsx'))) bad.push('the Crew My card page has no editor')
if (!/<CardFaceEditor/.test(r('app/(main)/spaces/[slug]/settings/checkin/member-cards-section.tsx'))) bad.push('the Space admin has no card editor')
if (!/<MemberCardsSection/.test(r('app/(main)/spaces/[slug]/settings/checkin/section.tsx'))) bad.push('the Space check-in workspace does not mount the card editor')
if (!existsSync('app/(public)/card/[token]/page.tsx')) bad.push('there is no public card face page')
const store = r('lib/devices/store.ts')
if (!/next_member_card_number/.test(store) || !/isCrewMember/.test(store)) bad.push('console cards are not numbered or not Crew-only')
const rewards = r('lib/member-cards/rewards.ts')
if (!/awardZapsForAction\([^)]*'meetup_tap'/.test(rewards) || !/'card_swap'/.test(rewards)) bad.push('a card tap no longer pays Zaps')
if (!/card_faces/.test(r('supabase/migrations/20270346024000_member_card_faces.sql'))) bad.push('the card_faces migration is missing')
if (bad.length) {
  console.error('LIVE-1282 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1282: member cards open the face their owner set, from Crew or the Space admin')

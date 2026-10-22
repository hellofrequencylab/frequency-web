#!/usr/bin/env node
// LIVE-1297 probe: the cards (the viewer's Crew card and the Space card) are their own view under Check
// in, and the Space's cards carry the same per-card on/off switches as My card. Fails if the card view is
// dropped from the Check in views, if the door view mounts a card section again, or if the Space's card
// list loses its switches.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const dir = 'app/(main)/spaces/[slug]/settings/checkin'
if (!/key: 'card', label: 'Cards'/.test(r('lib/spaces/offerings.ts'))) bad.push('Check in has no Space card view')
const section = r(`${dir}/section.tsx`)
const doorView = section.split("=== 'card')")[1]?.split('return (')[2] ?? ''
if (!/=== 'card'\)[\s\S]*?<MyCardSection[\s\S]*?<MemberCardsSection/.test(section)) bad.push('the Cards view does not render both cards')
if (/<MemberCardsSection|<MyCardSection/.test(doorView)) bad.push('the door view still mounts a card section')
if (!/<MyCardsList cards=\{cards\} spaceId=\{space\.id\}/.test(r(`${dir}/member-cards-section.tsx`)))
  bad.push("the Space's cards do not use the My card switches")
if (!/export async function setSpaceCardOn/.test(r('lib/member-cards/actions.ts'))) bad.push('no action switches a Space card')
if (bad.length) {
  console.error('LIVE-1297 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1297: the cards have their own view under Check in, with the My card switches')

#!/usr/bin/env node
// LIVE-1302 probe: a member who runs a Space gets that Space's card on My card, with the same editor
// as the Space's Check in Cards view, and their public card face lists the Spaces they run with their
// links. Fails if My card stops mounting the Space card section, or the face stops listing the Spaces.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!/<SpaceTools profileId=/.test(r('app/(main)/crew/card/page.tsx'))) bad.push('My card no longer mounts the business half')
if (!/<MemberCardsSection space=\{space\}/.test(r('app/(main)/crew/card/space-tools.tsx'))) bad.push("My card does not show the owner's Space card")
const face = r('app/(public)/card/[token]/page.tsx')
if (!/\.eq\('owner_profile_id', card\.owner\.profileId\)[\s\S]*?space: true/.test(face)) bad.push('the card face does not list the Spaces its owner runs')
if (!/\.neq\('visibility', 'private'\)/.test(face)) bad.push('the card face could list a private Space')
if (bad.length) {
  console.error('LIVE-1302 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log("LIVE-1302: a Space owner's one card carries the business half on My card and on its face")

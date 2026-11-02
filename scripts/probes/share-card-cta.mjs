#!/usr/bin/env node
// LIVE-1962: every share card draws its action button, and the QR and Share panel previews the card.
//
// A card route passes when it sets `cta:` itself or hands its input to a shared builder that does
// (lib/og/event-card.tsx and lib/og/listing-card.tsx set it for every caller). The panel passes when
// qr-share-dropdown renders SharePreviewCard.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const routes = execSync("git ls-files 'app/**/opengraph-image.tsx' 'app/**/opengraph-image/*.tsx' 'app/dev/og-root-card/route.tsx' lib/og/claim-card.tsx")
  .toString().split('\n').filter(Boolean).filter((f) => !/\.test\./.test(f) && !f.startsWith('app/hosted/'))
// The hosted-site card is the site's own design, not a Stage card, so it is out of scope. The Space
// Spotlight card re-exports the Space card.
const SHARED = ['eventCardResponse', 'listingCardResponse', 'claimCardResponse', '(public)/spaces/[slug]/opengraph-image']
const bad = routes.filter((f) => {
  const s = readFileSync(f, 'utf8')
  return !/\bcta\s*:/.test(s) && !SHARED.some((n) => s.includes(n))
})
const panel = readFileSync('components/qr/qr-share-dropdown.tsx', 'utf8').includes('<SharePreviewCard')
if (bad.length || !panel) {
  console.error('share cards without a button:', bad.join(', ') || 'none', '| panel preview:', panel)
  process.exit(1)
}
console.log(`ok: ${routes.length} card routes draw a button, panel previews the card`)

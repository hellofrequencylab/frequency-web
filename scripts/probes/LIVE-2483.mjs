#!/usr/bin/env node
// LIVE-2483: Launch Your Website and Email Marketing are their own builder pages (owner 2026-11-19). Fails while either
// page is missing, while the website builder does not publish through the one website path, or while the email builder
// could send instead of saving a draft.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
for (const [page, body] of [['app/(marketing)/launch-your-website/page.tsx', 'LaunchYourWebsitePage'], ['app/(marketing)/email-marketing/page.tsx', 'EmailMarketingPage']]) {
  assert.ok(existsSync(page) && read(page).includes(`<${body}`), `${page} is not its builder`)
}
const apply = read('lib/feature-builder/apply.ts')
assert.ok(/website: applyWebsite/.test(apply) && /publishWebsiteWords\(/.test(apply) && /publishStarterSite\(/.test(apply), 'the website builder does not publish through the website path')
assert.ok(/email: applyEmail/.test(apply) && /createSpaceEmailDraft\(/.test(apply), 'the email builder does not save a draft')
assert.ok(!/sendSpaceEmail|sendCampaign|sendSpaceEmailDraft/.test(apply), 'the email builder can send')
const catalog = read('lib/feature-builder/catalog.ts')
for (const id of ['website', 'email']) assert.ok(new RegExp(`id: '${id}'[^\\n]*open: true`).test(catalog), `the ${id} builder is not offered`)
console.log('LIVE-2483: Launch Your Website and Email Marketing are their own builders')

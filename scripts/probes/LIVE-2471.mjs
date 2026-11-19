#!/usr/bin/env node
// LIVE-2471: the 12-minute business builder is Launch Your Business, at /launch-your-business (owner 2026-11-19:
// "The current create a space page needs to be Launch Your Business"). Fails while the builder is served at
// /create-a-space, while a signed-out business door (/spaces/new, /launch, the niche doors) still lands there, or
// while the old address does not forward to the new one.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
assert.ok(existsSync('app/(marketing)/launch-your-business/page.tsx'), 'no /launch-your-business page')
assert.ok(/<CreateSpaceStudio/.test(read('app/(marketing)/launch-your-business/page.tsx')), 'the builder is not on /launch-your-business')
assert.ok(!/<CreateSpaceStudio/.test(existsSync('app/(marketing)/create-a-space/page.tsx') ? read('app/(marketing)/create-a-space/page.tsx') : ''), '/create-a-space still serves the business builder')
assert.ok(/CREATE_SPACE_WIZARD = '\/launch-your-business'/.test(read('proxy.ts')), 'signed-out /spaces/new and /launch do not open Launch Your Business')
assert.ok(/const WIZARD = '\/launch-your-business'/.test(read('lib/launch/destination.ts')), 'launchHomeHref still sends a visitor to /create-a-space')
assert.ok(/`\/launch-your-business\?\$\{s\}`/.test(read('lib/create-space/door.ts')), 'the /spaces/new door does not carry its hints to /launch-your-business')
const seo = read('lib/seo/frequency-pages.ts')
assert.ok(/launchBusiness: \{\s*path: '\/launch-your-business',\s*title: 'Launch Your Business/.test(seo), 'the page is not titled Launch Your Business')
const config = read('next.config.ts')
assert.ok(config.includes("{ source: '/create-a-space', destination: '/launch-your-business', permanent: false }") || existsSync('app/(marketing)/create-a-space/page.tsx'), 'the old address neither forwards nor serves a page')
console.log('LIVE-2471: the business builder is Launch Your Business at /launch-your-business')

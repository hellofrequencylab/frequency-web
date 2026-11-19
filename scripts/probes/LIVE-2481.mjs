#!/usr/bin/env node
// LIVE-2481: Free Spotlight is its own builder page (owner 2026-11-19: four builder pages, each its own feature, a
// light timer, the next feature offered and never forced; Free Spotlight builds the PERSONAL Spotlight). Fails while
// /free-spotlight is missing or redirects away, while the builder does not save onto the profile through the one
// profile writer and publish it, while a visitor's sign-in has nowhere to land, or while the finish offers no way out.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const page = 'app/(marketing)/free-spotlight/page.tsx'
assert.ok(existsSync(page) && /<FreeSpotlightPage/.test(read(page)), '/free-spotlight is not the Free Spotlight builder')
assert.ok(!/source: '\/free-spotlight'/.test(read('next.config.ts')), '/free-spotlight still redirects away')
const apply = read('lib/feature-builder/apply.ts')
assert.ok(/savePersonalSpotlight\(/.test(apply) && /setSpotlightPublished\(true\)/.test(apply), 'the Spotlight builder does not save and publish the personal Spotlight')
assert.ok(/spotlight: applySpotlight/.test(apply), 'the Spotlight builder is not wired')
const route = 'app/finish/[feature]/route.ts'
assert.ok(existsSync(route) && /readFeatureHold\(\)/.test(read(route)) && /applyFeature\(/.test(read(route)), 'a visitor who signs in has nowhere to land')
const actions = read('lib/feature-builder/actions.ts')
assert.ok(/sendSignupLink\(/.test(actions) && /signInWithGoogle\(/.test(actions), 'the builder does not hand over through the existing sign-in doors')
const next = read('components/frequency/site/pages/feature-builder/next-steps.tsx')
assert.ok(/I&apos;m done for now/.test(next), 'the finish offers no way out')
assert.ok(/clockView/.test(read('components/frequency/site/pages/feature-builder/feature-studio.tsx')), 'the builder has no clock')
console.log('LIVE-2481: Free Spotlight is its own builder, saved to the profile, with a way out at the finish')

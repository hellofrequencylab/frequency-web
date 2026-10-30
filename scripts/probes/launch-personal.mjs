#!/usr/bin/env node
// LIVE-1925: the "just my personal Spotlight" choice is a real step, and it saves through the one profile writer.
//
// Fails when the step page, its save action or the pure write builder goes missing, or when the step starts writing
// the profile through anything but updateProfile (a second writer).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
if (!existsSync('app/(main)/launch/personal/page.tsx')) bad.push('the personal Spotlight step page is gone')
if (!existsSync('lib/launch/personal.ts')) bad.push('the pure profile-write builder is gone')
const io = existsSync('lib/launch/personal-io.ts') ? readFileSync('lib/launch/personal-io.ts', 'utf8') : ''
if (!io.includes('updateProfile')) bad.push('the personal step no longer saves through updateProfile')
if (/\.from\('profiles'\)\s*\.\s*(update|upsert|insert)/.test(io.replace(/\s+/g, ' ').replace(/\) \./g, ').'))) bad.push('the personal step writes the profiles table directly: a second writer')
if (!readFileSync('lib/launch/actions.ts', 'utf8').includes('savePersonalFormAction')) bad.push('the save action is gone')
if (!readFileSync('lib/launch/intent.ts', 'utf8').includes('/launch/personal')) bad.push('the intent screen no longer points at the personal step')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('launch personal: ok')

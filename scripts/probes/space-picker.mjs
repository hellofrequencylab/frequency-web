#!/usr/bin/env node
// LIVE-1362 (ADR-1883): the Space picker is wired from config to storage.
//
// Fails when createSpace stops resolving the picker answers, when the wizard stops passing them, when the
// page stops reading a door's niche, or when the picker is no longer behind its switch.
import { readFileSync } from 'node:fs'

const bad = []
const read = (f) => readFileSync(f, 'utf8')
if (!read('lib/spaces/provision.ts').includes('resolvePicker({ niche: input.niche, action: input.action, feel: input.feel, site: input.site })')) bad.push('createSpace no longer resolves the picker answers')
const wizard = read('app/(main)/spaces/new/create-space-wizard.tsx')
if (!wizard.includes('niche: picked.niche') || !wizard.includes('<SpacePicker')) bad.push('the wizard no longer carries the picker answers')
const page = read('app/(main)/spaces/new/page.tsx')
if (!page.includes("envFlag('SPACE_PICKER_ENABLED')")) bad.push('the picker is no longer behind SPACE_PICKER_ENABLED')
if (!page.includes("get('fq_beta_seq')")) bad.push('the page no longer reads the door niche cookie')
if (!/^SPACE_PICKER_ENABLED=$/m.test(read('.env.example'))) bad.push('.env.example lost the blank SPACE_PICKER_ENABLED line')
if (!read('docs/RUNBOOKS.md').includes('### Space picker')) bad.push('RUNBOOKS lost the Space picker gate')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('space picker: config, creation, wizard and switch are wired')

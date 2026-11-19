#!/usr/bin/env node
// LIVE-2482: Create a Space is its own builder page at /create-a-space (owner 2026-11-19). Fails while /create-a-space
// is missing or forwards to the business builder, or while the builder does not make the Space through createSpace.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const page = 'app/(marketing)/create-a-space/page.tsx'
assert.ok(existsSync(page) && /<CreateASpacePage/.test(read(page)), '/create-a-space is not the Create a Space builder')
assert.ok(!/source: '\/create-a-space'/.test(read('next.config.ts')), '/create-a-space still forwards away')
const apply = read('lib/feature-builder/apply.ts')
assert.ok(/space: applySpace/.test(apply) && /makeSpace\(/.test(apply), 'the Space builder does not make the Space through createSpace')
assert.ok(/id: 'space'[^\n]*open: true/.test(read('lib/feature-builder/catalog.ts')), 'the Space builder is not offered')
console.log('LIVE-2482: Create a Space is its own builder, made through createSpace')

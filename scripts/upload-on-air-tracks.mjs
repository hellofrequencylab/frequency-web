#!/usr/bin/env node
// Copy the On Air ambient tracks from public/tracks into Supabase Storage (SCAN-1213).
//
// WHY. The three licensed tracks are 14 MB of binary in the git tree and in every deploy. They move
// to the public audio bucket (`recordings-media`, which already allows audio/mpeg) under
// `platform/on-air/`, and lib/on-air.ts then points the player there. This script is the copy; the
// change that deletes public/tracks comes after it has run and been checked.
//
// WHAT IT DOES. For each .mp3 in public/tracks: upload (replacing any earlier copy), then read the
// public URL back and compare its size AND its SHA-256 with the file on disk. It exits 1 on any
// difference, so a green run means the stored copies are the repo's copies, byte for byte.
//
// RUN. `on-air-tracks-upload` workflow (manual), or by hand with NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY set. Safe to run again: it replaces and re-checks.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BUCKET = 'recordings-media'
const PREFIX = 'platform/on-air'
const DIR = 'public/tracks'

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!base || !key) {
  console.error('upload-on-air-tracks: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const files = readdirSync(DIR).filter((name) => /^[a-z0-9-]+\.mp3$/.test(name)).sort()
if (files.length === 0) {
  console.error(`upload-on-air-tracks: no .mp3 in ${DIR}, nothing to copy`)
  process.exit(1)
}

let failed = false
for (const name of files) {
  const bytes = readFileSync(join(DIR, name))
  const path = `${PREFIX}/${name}`
  const put = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      'content-type': 'audio/mpeg',
      // A year: the name is the version. A changed track ships under a new file name.
      'cache-control': 'max-age=31536000',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!put.ok) {
    console.error(`  ${name}: upload failed with ${put.status} ${(await put.text()).slice(0, 200)}`)
    failed = true
    continue
  }
  const publicUrl = `${base}/storage/v1/object/public/${BUCKET}/${path}`
  const got = await fetch(publicUrl, { cache: 'no-store' })
  const stored = got.ok ? Buffer.from(await got.arrayBuffer()) : null
  const same = stored !== null && stored.length === bytes.length && sha(stored) === sha(bytes)
  console.log(`  ${name}: ${bytes.length} bytes, ${got.status} ${got.headers.get('content-type')}, ${same ? 'stored copy matches' : 'STORED COPY DIFFERS'}  ${publicUrl}`)
  if (!same) failed = true
}
if (failed) {
  console.error('upload-on-air-tracks: FAILED, do not delete public/tracks')
  process.exit(1)
}
console.log(`upload-on-air-tracks: ${files.length} track(s) stored and verified in ${BUCKET}/${PREFIX}`)

#!/usr/bin/env node
// SHRINK THE SPACE PHOTOS AND LOGOS STORED BEFORE PERF-012 (PERF-020, owner ruling 2026-11-19:
// "Shrink them, keep a backup").
//
//   node --env-file=.env.local scripts/shrink-stored-space-photos.mjs            # dry run: lists what it would do
//   node --env-file=.env.local scripts/shrink-stored-space-photos.mjs --apply    # backs up, then shrinks in place
//   node --env-file=.env.local scripts/shrink-stored-space-photos.mjs --restore <backup folder>   # puts the originals back
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (both are in .env.local on the owner's Mac).
//
// ── WHY ────────────────────────────────────────────────────────────────────────────────────────
// Since PERF-012 a photo is web-sized in the browser before it is stored. Files uploaded before that are
// still the size the phone made them: on the public Spaces directory one logo drawn at 28px is 1.37 MB.
// The ruling was to shrink the stored files once, never to route them through the paid image optimizer.
//
// ── WHAT IT TOUCHES ────────────────────────────────────────────────────────────────────────────
// Only Supabase Storage files that a Space points at: every storage URL found in a `spaces` row (cover,
// logo, preferences) or in a Space's `pages` rows (page photos). Only JPEG, PNG and WebP over 600 KB, the
// same line the upload pass uses. Each one is resized to at most 2000px on its longest edge (the upload
// pass's size; a Space logo to 800px, since it is drawn at 28 to 200px) and saved back AT THE SAME PATH IN THE SAME FORMAT, so every link to it keeps working and
// nothing in the database changes. A PNG stays a PNG and a WebP keeps its transparency. A result that is
// not at least 10% smaller is left alone.
//
// ── THE BACKUP ─────────────────────────────────────────────────────────────────────────────────
// Before any upload, every original is written to ~/frequency-photo-backup-<date>/<bucket>/<path> and read
// back to check its size, with a manifest.json listing each file. A file whose backup did not land is
// skipped, never shrunk. `--restore <that folder>` uploads every original back to where it came from.

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve, sep } from 'node:path'
import sharp from 'sharp'

const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run it with --env-file=.env.local.')
  process.exit(1)
}

const MIN_BYTES = 600 * 1024 // the upload pass's line (lib/library/image-shrink.ts WEB_SIZE_BYTES)
const MAX_DIM = 2000 // the upload pass's size (WEB_MAX_DIM)
const LOGO_DIM = 800 // a logo is drawn at 28 to 200px, so 800 still covers a sharp 2x header
const QUALITY = 82 // the upload pass's 0.82
const MIN_SAVING = 0.9 // keep a result only when it is at most 90% of the original
const FORMATS = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const restoreAt = args.indexOf('--restore')
const RESTORE = restoreAt >= 0 ? args[restoreAt + 1] : null

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const kb = (n) => `${Math.round(n / 1024)} KB`

/** A bucket and path come from database rows that members wrote, so they are checked before they become a
 *  local file name: no `..`, no absolute path, and the result must stay inside the backup folder. */
function safeLocal(root, bucket, path) {
  if (!/^[a-z0-9_-]+$/i.test(bucket) || path.startsWith('/') || path.split('/').some((seg) => seg === '..' || seg === '')) return null
  const full = resolve(root, bucket, path)
  return full.startsWith(resolve(root) + sep) ? full : null
}

async function rest(path) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: { ...auth, Range: `${from}-${from + 999}` } })
    if (!res.ok) throw new Error(`reading ${path.split('?')[0]} failed: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

/** Every storage object a value points at, as { bucket, path }. Matches the project host and any custom
 *  domain in front of it, public and image-render URLs alike. PURE. */
function storageRefs(value) {
  const out = new Map()
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  const re = /https?:\/\/[^\s"'\\)]+?\/storage\/v1\/(?:object|render\/image)\/public\/([a-z0-9_-]+)\/([^\s"'\\?#)]+)/gi
  for (const m of text.matchAll(re)) {
    let path
    try {
      path = decodeURIComponent(m[2])
    } catch {
      path = m[2]
    }
    out.set(`${m[1]}/${path}`, { bucket: m[1], path })
  }
  return [...out.values()]
}

const objectUrl = (bucket, path) => `${BASE}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`

async function download(bucket, path) {
  const res = await fetch(objectUrl(bucket, path), { headers: auth })
  if (!res.ok) throw new Error(`download ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function upload(bucket, path, buf, contentType) {
  const res = await fetch(objectUrl(bucket, path), {
    method: 'PUT',
    headers: { ...auth, 'content-type': contentType, 'cache-control': 'max-age=3600', 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) throw new Error(`upload ${res.status} ${await res.text()}`)
}

/** Resize to MAX_DIM and re-encode in the SAME format. Returns null when it would not help. */
async function shrink(buf, maxDim) {
  const meta = await sharp(buf).metadata()
  const type = FORMATS[meta.format]
  if (!type || (meta.pages ?? 1) > 1) return null // GIF, SVG, HEIC, animated: left alone
  // rotate() bakes the EXIF orientation in, because the re-encode drops the metadata that carried it.
  let img = sharp(buf).rotate().resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
  if (meta.format === 'jpeg') img = img.jpeg({ quality: QUALITY, mozjpeg: true })
  else if (meta.format === 'webp') img = img.webp({ quality: QUALITY })
  else img = img.png({ compressionLevel: 9, palette: true, quality: 90 })
  const out = await img.toBuffer({ resolveWithObject: true })
  if (out.data.length > buf.length * MIN_SAVING) return null
  return { buf: out.data, type, from: `${meta.width}x${meta.height}`, to: `${out.info.width}x${out.info.height}` }
}

async function restore(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  let ok = 0
  for (const f of manifest.files.filter((x) => x.shrunk)) {
    const local = safeLocal(dir, f.bucket, f.path)
    if (!local) {
      console.log(`skip  ${f.bucket}/${f.path}: not a safe path`)
      continue
    }
    const buf = readFileSync(local)
    await upload(f.bucket, f.path, buf, f.contentType)
    ok++
    console.log(`restored ${f.bucket}/${f.path} (${kb(buf.length)})`)
  }
  console.log(`\nPut back ${ok} original${ok === 1 ? '' : 's'}.`)
}

async function main() {
  if (RESTORE) return restore(RESTORE)

  const spaces = await rest('spaces?select=*')
  const pages = await rest('pages?select=*&space_id=not.is.null')
  const refs = new Map()
  for (const row of [...spaces, ...pages]) for (const r of storageRefs(row)) refs.set(`${r.bucket}/${r.path}`, { ...r, maxDim: MAX_DIM })
  // A file that is ONLY ever a logo gets the logo size; one also used as a photo keeps the photo size.
  const logos = new Set(spaces.flatMap((s) => storageRefs(s.brand_logo_url ?? '')).map((r) => `${r.bucket}/${r.path}`))
  const photos = new Set(storageRefs([spaces.map((s) => ({ ...s, brand_logo_url: null })), pages]).map((r) => `${r.bucket}/${r.path}`))
  for (const k of logos) if (!photos.has(k)) refs.get(k).maxDim = LOGO_DIM
  console.log(`${spaces.length} Spaces and ${pages.length} Space pages point at ${refs.size} stored files.`)

  const stamp = new Date().toISOString().slice(0, 10)
  const backupDir = join(homedir(), `frequency-photo-backup-${stamp}`)
  const manifest = { made: new Date().toISOString(), source: BASE, files: [] }
  let before = 0
  let after = 0
  let count = 0

  for (const { bucket, path, maxDim } of refs.values()) {
    if (!safeLocal(backupDir, bucket, path)) {
      console.log(`skip  ${bucket}/${path}: not a safe path`)
      continue
    }
    if (!/\.(jpe?g|png|webp)$/i.test(path)) continue
    let buf
    try {
      buf = await download(bucket, path)
    } catch (e) {
      console.log(`skip  ${bucket}/${path}: ${e.message}`)
      continue
    }
    if (buf.length <= MIN_BYTES) continue
    let next
    try {
      next = await shrink(buf, maxDim)
    } catch (e) {
      console.log(`skip  ${bucket}/${path}: could not read it (${e.message})`)
      continue
    }
    if (!next) continue
    console.log(`${APPLY ? 'shrink' : 'would'} ${bucket}/${path}: ${kb(buf.length)} ${next.from} -> ${kb(next.buf.length)} ${next.to}`)
    if (APPLY) {
      const local = safeLocal(backupDir, bucket, path)
      mkdirSync(dirname(local), { recursive: true })
      writeFileSync(local, buf)
      if (!existsSync(local) || statSync(local).size !== buf.length) {
        console.log(`  backup did not land, left as it is`)
        continue
      }
      const entry = { bucket, path, contentType: next.type, bytes: buf.length, newBytes: next.buf.length, shrunk: false }
      manifest.files.push(entry)
      writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
      try {
        await upload(bucket, path, next.buf, next.type)
        entry.shrunk = true
        writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
      } catch (e) {
        console.log(`  upload failed, the stored file is unchanged: ${e.message}`)
        continue
      }
    }
    before += buf.length
    after += next.buf.length
    count++
  }

  const verb = APPLY ? 'Shrank' : 'Would shrink'
  console.log(`\n${verb} ${count} file${count === 1 ? '' : 's'}: ${kb(before)} -> ${kb(after)}.`)
  if (APPLY && count) console.log(`Originals are in ${backupDir}. To undo: --restore "${backupDir}"`)
  if (!APPLY) console.log('Nothing was changed. Run again with --apply to back up and shrink.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})

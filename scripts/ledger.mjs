#!/usr/bin/env node
// The ledger CLI (HYG-145, ADR-1635). The merged view and the converter for branches that still
// edit the two shared ledger files directly.
//
//   pnpm ledger:view [<ID> | --adr <n>]   print the merged backlog (or one row, or one ADR's text)
//   pnpm ledger:from-diff [--main <ref>] [--drop-preamble] [--check]
//        Convert THIS branch's direct edits to docs/BUILD-BACKLOG.json and docs/DECISIONS.md
//        (relative to its merge base with origin/main) into fragments under docs/ledger/, then
//        restore both files to origin/main's copy. After it, the branch no longer touches the two
//        shared files, so it merges beside every other fragment PR without a fold.
//
// A conversion that cannot be expressed as fragments is REFUSED before anything is written, and
// names what blocked it: a row or ADR both sides changed, an ADR edited in place, a deleted row,
// a meta edit outside meta.slate.waves, an id main has since taken. Those stay the legacy path
// (`git merge origin/main && pnpm fold`), which still works.
//
// Exit codes: 0 done · 1 refused or broken fragments · 2 usage or git error.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'
import {
  ADR_DIR,
  BACKLOG,
  DECISIONS,
  ROWS_DIR,
  SLATED_STATUSES,
  applyRowFragments,
  mergeAdrFragments,
  readBacklogView,
  readDecisionsView,
  waveToken,
} from './lib/ledger.mjs'
import { splitAdrs } from './maintenance/fold-ledger-docs.mjs'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** The wave token each id sits on in a document. */
function waveOf(doc) {
  const out = new Map()
  for (const w of doc?.meta?.slate?.waves ?? []) for (const id of w.ids ?? []) if (!out.has(id)) out.set(id, waveToken(w.name))
  return out
}

/** A document's meta with the waves' ids blanked, for "did anything but placement change?". */
function metaShape(doc) {
  const { entries: _entries, ...rest } = doc ?? {}
  const copy = JSON.parse(JSON.stringify(rest))
  for (const w of copy?.meta?.slate?.waves ?? []) delete w.ids
  return copy
}

/** THE ROW HALF, pure. `mb` is the merge base, `main` the tip the fragments will apply to, `ours`
 *  this branch. Returns { fragments: [{ id, body }], refusals: [] }. */
export function rowFragmentsFromDiff({ mb, main, ours }) {
  const refusals = []
  const fragments = []
  const MB = new Map((mb.entries ?? []).map((e) => [e.id, e]))
  const M = new Map((main.entries ?? []).map((e) => [e.id, e]))
  const O = new Map((ours.entries ?? []).map((e) => [e.id, e]))
  const oursWave = waveOf(ours)
  const mbWave = waveOf(mb)

  if (!same(metaShape(ours), metaShape(mb))) {
    refusals.push(
      `${BACKLOG}: this branch changed something outside the rows and the wave placements (meta, or a wave's name). ` +
        'A fragment carries rows and placements only; keep that edit on the legacy path (git merge origin/main && pnpm fold).',
    )
  }
  for (const id of MB.keys()) if (!O.has(id)) refusals.push(`${BACKLOG}: this branch deletes row ${id}; a fragment cannot delete a row`)

  for (const [id, row] of O) {
    const base = MB.get(id)
    const onMain = M.get(id)
    const slated = SLATED_STATUSES.includes(row.status)
    if (!base) {
      if (onMain) {
        if (!same(onMain, row)) refusals.push(`row ${id} is new on this branch, and main has since added a different ${id}: take the next free id`)
        continue
      }
      const body = { ...row }
      if (slated && oursWave.has(id)) body.wave = oursWave.get(id)
      fragments.push({ id, body })
      continue
    }
    const moved = slated && oursWave.has(id) && oursWave.get(id) !== mbWave.get(id)
    if (same(base, row) && !moved) continue
    if (!onMain) {
      refusals.push(`row ${id} is edited on this branch and gone from main`)
      continue
    }
    const patch = {}
    const append = {}
    for (const k of new Set([...Object.keys(base), ...Object.keys(row)])) {
      if (k === 'id' || same(base[k], row[k])) continue
      if (same(onMain[k], row[k])) continue // main already carries this exact change
      const grew = typeof row[k] === 'string' && typeof base[k] === 'string' && row[k].length > base[k].length && row[k].startsWith(base[k])
      if (grew && typeof onMain[k] === 'string') {
        append[k] = row[k].slice(base[k].length) // composes with whatever main did to the field
        continue
      }
      if (!same(onMain[k], base[k])) {
        refusals.push(`row ${id}: both this branch and main changed "${k}". A human decides; then re-run`)
        continue
      }
      patch[k] = row[k] === undefined ? null : row[k]
    }
    const body = { id }
    if (Object.keys(patch).length) body.patch = patch
    if (Object.keys(append).length) body.append = append
    if (moved) body.wave = oursWave.get(id)
    if (Object.keys(body).length > 1) fragments.push({ id, body })
  }
  return { fragments, refusals }
}

/** THE ADR HALF, pure. Texts in, { fragments: [{ id, text }], refusals } out. */
export function adrFragmentsFromDiff({ mb, main, ours, dropPreamble = false }) {
  const refusals = []
  const fragments = []
  const B = splitAdrs(mb)
  const T = splitAdrs(main)
  const O = splitAdrs(ours)
  const bi = new Map(B.blocks.map((b) => [b.id, b.text]))
  const ti = new Map(T.blocks.map((b) => [b.id, b.text]))
  if (O.preamble !== B.preamble && !dropPreamble) {
    refusals.push(`${DECISIONS}: this branch edited the preamble (the theme index). Re-run with --drop-preamble to discard that edit, or keep it on the legacy path`)
  }
  const seen = new Set()
  for (const { id, text } of O.blocks) {
    if (seen.has(id)) {
      refusals.push(`${DECISIONS}: this branch declares ADR-${id} twice`)
      continue
    }
    seen.add(id)
    if (bi.has(id)) {
      if (bi.get(id) !== text) refusals.push(`ADR-${id} is edited in place on this branch; an amendment is a new ADR (fragment), or it stays on the legacy path`)
      continue
    }
    if (ti.has(id)) {
      if (ti.get(id).replace(/\s+$/, '') !== text.replace(/\s+$/, '')) refusals.push(`ADR-${id} is new on this branch, and main has since declared a different ADR-${id}: renumber it`)
      continue
    }
    fragments.push({ id, text: text.replace(/\s+$/, '') + '\n' })
  }
  for (const id of bi.keys()) if (!seen.has(id)) refusals.push(`${DECISIONS}: this branch deletes ADR-${id}; a fragment cannot delete one`)
  return { fragments, refusals }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function arg(argv, name, fallback) {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

function fromDiff(argv) {
  const mainRef = arg(argv, '--main', 'origin/main')
  const check = argv.includes('--check')
  const dropPreamble = argv.includes('--drop-preamble')
  let mbSha
  try {
    mbSha = git(['merge-base', 'HEAD', mainRef]).trim()
  } catch (err) {
    console.error(`ledger:from-diff: cannot find the merge base with ${mainRef} (git fetch origin main first): ${String(err.stderr ?? err.message).trim()}`)
    return 2
  }
  const at = (ref, path) => {
    try {
      return git(['show', `${ref}:${path}`])
    } catch {
      return ''
    }
  }
  const oursBacklogText = readFileSync(BACKLOG, 'utf8')
  const oursDecisions = readFileSync(DECISIONS, 'utf8')
  const mainBacklogText = at(mainRef, BACKLOG)
  const mainDecisions = at(mainRef, DECISIONS)
  const mbBacklogText = at(mbSha, BACKLOG)
  const mbDecisions = at(mbSha, DECISIONS)

  const backlogChanged = oursBacklogText !== mbBacklogText
  const decisionsChanged = oursDecisions !== mbDecisions
  if (!backlogChanged && !decisionsChanged) {
    console.log(`ledger:from-diff: this branch does not edit ${BACKLOG} or ${DECISIONS} against its merge base with ${mainRef}. Nothing to convert.`)
    return 0
  }

  const refusals = []
  let rows = { fragments: [], refusals: [] }
  let adrs = { fragments: [], refusals: [] }
  const mainDoc = JSON.parse(mainBacklogText)
  if (backlogChanged) {
    rows = rowFragmentsFromDiff({ mb: JSON.parse(mbBacklogText), main: mainDoc, ours: JSON.parse(oursBacklogText) })
    refusals.push(...rows.refusals)
  }
  if (decisionsChanged) {
    adrs = adrFragmentsFromDiff({ mb: mbDecisions, main: mainDecisions, ours: oursDecisions, dropPreamble })
    refusals.push(...adrs.refusals)
  }

  // Existing fragments on this branch: identical is fine, different is a refusal (one file per row).
  const writes = [
    ...rows.fragments.map((f) => ({ path: `${ROWS_DIR}/${f.id}.json`, text: JSON.stringify(f.body, null, 2) + '\n' })),
    ...adrs.fragments.map((f) => ({ path: `${ADR_DIR}/ADR-${f.id}.md`, text: f.text })),
  ]
  for (const w of writes) {
    if (existsSync(w.path) && readFileSync(w.path, 'utf8') !== w.text) refusals.push(`${w.path} already exists on this branch with different content`)
  }

  // Prove the fragments reproduce this branch's rows on top of main before writing anything.
  if (!refusals.length) {
    const existing = readBacklogView().fragments.filter((f) => !rows.fragments.some((r) => r.id === f.id))
    const planned = rows.fragments.map((f) => ({ path: `${ROWS_DIR}/${f.id}.json`, id: f.id, body: f.body, problem: null }))
    const applied = applyRowFragments(mainDoc, [...existing, ...planned])
    refusals.push(...applied.problems)
    const merged = new Map(applied.doc.entries.map((e) => [e.id, e]))
    const ours = new Map(JSON.parse(oursBacklogText).entries.map((e) => [e.id, e]))
    for (const f of rows.fragments) {
      const want = ours.get(f.id)
      const got = merged.get(f.id)
      for (const k of Object.keys(f.body.patch ?? (f.body.title ? want : {}))) {
        if (k === 'wave') continue
        if (!same(got?.[k], want?.[k])) refusals.push(`row ${f.id}: the fragment does not reproduce this branch's "${k}" on top of main`)
      }
    }
    const existingAdrs = readDecisionsView().fragments
    const adrCheck = mergeAdrFragments(mainDecisions, [
      ...existingAdrs.filter((e) => !adrs.fragments.some((a) => a.id === e.id)),
      ...adrs.fragments.map((f) => ({ path: `${ADR_DIR}/ADR-${f.id}.md`, id: f.id, text: f.text })),
    ])
    refusals.push(...adrCheck.problems)
  }

  if (refusals.length) {
    console.error(`🔴 ledger:from-diff refused; nothing was written:`)
    for (const r of refusals) console.error(`   ${r}`)
    return 1
  }

  console.log(`ledger:from-diff: merge base ${mbSha.slice(0, 9)} with ${mainRef}.`)
  for (const f of rows.fragments) console.log(`  ${ROWS_DIR}/${f.id}.json  ${f.body.title ? 'new row' : `edit: ${Object.keys(f.body).filter((k) => k !== 'id').join(', ')}`}`)
  for (const f of adrs.fragments) console.log(`  ${ADR_DIR}/ADR-${f.id}.md`)
  if (check) {
    console.log('  [check only] nothing written.')
    return 0
  }
  for (const w of writes) {
    mkdirSync(w.path.slice(0, w.path.lastIndexOf('/')), { recursive: true })
    writeFileSync(w.path, w.text)
  }
  writeFileSync(BACKLOG, mainBacklogText)
  writeFileSync(DECISIONS, mainDecisions)
  console.log(`  ${BACKLOG} and ${DECISIONS} restored to ${mainRef}'s copy.`)
  console.log('\nNext:')
  console.log(`  git add docs/ledger ${BACKLOG} ${DECISIONS} && git commit -m "Move this PR's ledger edits to fragments (ADR-1635)"`)
  console.log(`  git merge ${mainRef}   # the two shared files no longer conflict`)
  console.log('  pnpm check:adr && pnpm check:backlog && pnpm check:one-list && pnpm check:id-collisions')
  return 0
}

function view(argv) {
  const adrAt = argv.indexOf('--adr')
  if (adrAt >= 0) {
    const n = String(argv[adrAt + 1] ?? '').replace(/^ADR-/, '')
    const block = splitAdrs(readDecisionsView().text).blocks.find((b) => b.id === n)
    if (!block) {
      console.error(`no ADR-${n} in the merged ledger`)
      return 1
    }
    process.stdout.write(block.text.replace(/\s+$/, '') + '\n')
    return 0
  }
  const v = readBacklogView()
  if (v.problems.length) {
    console.error(`ledger fragments are broken:\n  ${v.problems.join('\n  ')}`)
    return 79
  }
  const id = argv.find((a) => !a.startsWith('-'))
  if (!id) {
    process.stdout.write(JSON.stringify(v.doc, null, 2) + '\n')
    return 0
  }
  const row = v.doc.entries.find((e) => e.id === id)
  if (!row) {
    console.error(`no row ${id} in the merged backlog`)
    return 1
  }
  process.stdout.write(JSON.stringify(row, null, 2) + '\n')
  return 0
}

function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv
  if (cmd === 'from-diff') return fromDiff(rest)
  if (cmd === 'view') return view(rest)
  console.error('usage: node scripts/ledger.mjs <view [ID | --adr N] | from-diff [--main ref] [--drop-preamble] [--check]>')
  return 2
}

if (invokedDirectly(import.meta.url)) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(`ledger: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

#!/usr/bin/env node
// LIVE-871: protect the existing entity node upgrade, not the still-lossy legacy write path.
// Census fixtures retain real storage shapes; authored field values are synthetic markers.
// This gate cannot claim the E1 registry's up/down contract, Puck coverage, or raw legacy roundtrip.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { upgradeLayout, allNodes, NODE_ID_RE } from '../lib/entity-blocks/node-tree.ts'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const MANIFEST = 'scripts/node-document-safety-manifest.json'
const FIXTURES = 'scripts/fixtures/node-document-safety'
const CENSUS = 'scripts/entity-layout-corpus.json'
export const INDETERMINATE = 79
const sha = (value) => createHash('sha256').update(value).digest('hex')

export function integrityProblems(manifest, read, files) {
  const problems = []
  if (manifest.version !== 1 || !manifest.capturedAt || !manifest.scope) problems.push('manifest metadata missing')
  if (!Array.isArray(manifest.inputs) || manifest.inputs.length < 2) return [...problems, 'manifest inputs missing']
  const paths = manifest.inputs.map((entry) => entry.path)
  if (new Set(paths).size !== paths.length) problems.push('duplicate manifest input')
  if (!paths.includes(CENSUS)) problems.push('real structural census is missing')
  for (const entry of manifest.inputs) {
    if (!entry.source || !entry.whyIncluded || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) problems.push(`${entry.path}: incomplete provenance`)
    if (entry.path !== CENSUS && (!entry.path.startsWith(`${FIXTURES}/`) || entry.path.includes('..'))) {
      problems.push(`${entry.path}: input outside fixture scope`)
      continue
    }
    try { if (sha(read(entry.path)) !== entry.sha256) problems.push(`${entry.path}: sha256 changed; recapture with reason`) }
    catch { problems.push(`${entry.path}: missing input`) }
  }
  for (const file of files) if (!paths.includes(`${FIXTURES}/${file}`)) problems.push(`${file}: orphan fixture`)
  return problems
}

export function rehydrateCensus(entry) {
  const bag = (fields, type) => Object.fromEntries(fields.map((field) => [field, `${type}.${field}`]))
  return {
    rows: entry.rows,
    content: Object.fromEntries(Object.entries(entry.contentKeys).map(([type, fields]) => [type, bag(fields, type)])),
    style: Object.fromEntries(Object.entries(entry.styleKeys).map(([type, fields]) => [type, bag(fields, type)])),
    hidden: entry.hidden,
  }
}

export function documentProblems(raw, upgrade = upgradeLayout) {
  const problems = []
  const before = JSON.stringify(raw)
  const nodes = upgrade(raw)
  if (!nodes) return ['upgrade discarded an object document']
  if (JSON.stringify(raw) !== before) problems.push('upgrade mutated its input')
  if (!isDeepStrictEqual(upgrade(nodes), nodes)) problems.push('upgrade is not idempotent')
  if (!isDeepStrictEqual(upgrade(JSON.parse(JSON.stringify(nodes))), nodes)) problems.push('serialized node document changed on read')
  const flat = allNodes(nodes)
  const ids = flat.map((node) => node.nid)
  if (ids.some((id) => !NODE_ID_RE.test(id)) || new Set(ids).size !== ids.length) problems.push('unstable or duplicate node ids')
  if (!isDeepStrictEqual(upgrade(raw), nodes)) problems.push('node ids are not deterministic')
  const types = (raw.rows ?? []).flatMap((row) => (row.cells ?? []).flat()).map((entry) => typeof entry === 'string' ? entry : entry.type)
  const placed = nodes.rows.flatMap((row) => row.cells.flat()).map((node) => node.type)
  if (!isDeepStrictEqual(placed, types)) problems.push('placement types or duplicates were lost or reordered')
  for (const field of ['content', 'style']) {
    for (const [type, value] of Object.entries(raw[field] ?? {})) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) continue
      const owner = flat.find((node) => node.type === type && node[field] !== undefined)
      if (!owner || JSON.stringify(owner[field]) !== JSON.stringify(value)) problems.push(`${type}.${field}: authored bytes lost`)
    }
  }
  for (const type of raw.hidden ?? []) if (!flat.some((node) => node.type === type && node.hidden === true)) problems.push(`${type}: hidden author work lost`)
  return problems
}

export function checkNodeDocumentSafety(root = process.cwd()) {
  const read = (file) => readFileSync(path.join(root, file), 'utf8')
  const manifest = JSON.parse(read(MANIFEST))
  const problems = integrityProblems(manifest, read, readdirSync(path.join(root, FIXTURES)))
  if (problems.length) return problems
  const census = JSON.parse(read(CENSUS))
  // Three historic stores, including the subsequently dropped email_templates seed batch.
  // Keep that archive until an explicit, explained corpus recapture; do not silently truncate it.
  if (census.documents.length < 37 || new Set(census.documents.map((d) => d.store)).size < 3) problems.push('structural census was truncated')
  for (const entry of census.documents) problems.push(...documentProblems(rehydrateCensus(entry)).map((p) => `${entry.id}: ${p}`))
  for (const entry of manifest.inputs.filter((input) => input.path !== CENSUS)) problems.push(...documentProblems(JSON.parse(read(entry.path))).map((p) => `${entry.path}: ${p}`))
  return problems
}

if (invokedDirectly(import.meta.url)) {
  try {
    const problems = checkNodeDocumentSafety()
    if (problems.length) { console.error(`✗ node-document-safety:\n${problems.join('\n')}`); process.exitCode = 1 }
    else console.log('✓ node-document-safety: pinned census + fixtures preserve node identity, duplicate placements, unknown authored bags and stored bench')
  } catch (error) { console.error(`node-document-safety could not inspect its inputs: ${error.message}`); process.exitCode = INDETERMINATE }
}

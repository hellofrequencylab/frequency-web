#!/usr/bin/env node
// Derive focused email packets from the existing canonical ledger. Never write status here.
import { readFileSync } from 'node:fs'
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { loadBacklog } from './lib/ledger.mjs'

export function derivePackets(spec, entries) {
  const keys = new Set(spec.packets.map(p => p.key))
  if (keys.size !== spec.packets.length) throw new Error('Duplicate packet key')
  const visiting = new Set(), visited = new Set()
  const byKey = new Map(spec.packets.map(p => [p.key, p]))
  function visit(key) {
    if (!keys.has(key)) throw new Error(`Unknown dependency ${key}`)
    if (visiting.has(key)) throw new Error(`Dependency cycle at ${key}`)
    if (visited.has(key)) return
    visiting.add(key)
    for (const dep of byKey.get(key).dependsOn) visit(dep)
    visiting.delete(key); visited.add(key)
  }
  for (const key of keys) visit(key)
  const rows = new Map()
  for (const packet of spec.packets) {
    const matching = entries.filter(e => {
      const tokens = String(e.source?.ref ?? '').split(/\s+/)
      return tokens.includes(spec.program) && tokens.includes(`packet:${packet.key}`)
    })
    if (matching.length > 1) throw new Error(`Multiple canonical claims for ${packet.key}`)
    rows.set(packet.key, matching[0] ?? null)
  }
  const result = { program: spec.program, complete: [], active: [], ready: [], waiting: [] }
  for (const packet of spec.packets) {
    const row = rows.get(packet.key)
    const item = { ...packet, rowId: row?.id ?? null, canonicalStatus: row?.status ?? 'not-filed' }
    if (row?.status === 'done') result.complete.push(item)
    else {
      const missing = packet.dependsOn.filter(dep => rows.get(dep)?.status !== 'done')
      if (missing.length) result.waiting.push({ ...item, waitingFor: missing })
      else if (row?.status === 'open') result.active.push(item)
      else if (row) result.waiting.push({ ...item, waitingFor: [`canonical:${row.status}`] })
      else result.ready.push(item)
    }
  }
  return result
}

if (invokedDirectly(import.meta.url)) {
  try {
    const spec = JSON.parse(readFileSync('docs/space-email-packets.json', 'utf8'))
    const result = derivePackets(spec, loadBacklog().entries)
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(`${result.program}: ${result.complete.length}/${spec.packets.length} canonical packets complete`)
      for (const group of ['active', 'ready']) for (const p of result[group]) console.log(`${group}: ${p.key}${p.rowId ? ` (${p.rowId}, ${p.canonicalStatus})` : ''} — ${p.acceptance}`)
      console.log(`${result.waiting.length} packets await dependencies. Revalidate probes before pickup; canonical done is not live pilot proof.`)
    }
  } catch (err) { console.error(err.message); process.exitCode = 1 }
}

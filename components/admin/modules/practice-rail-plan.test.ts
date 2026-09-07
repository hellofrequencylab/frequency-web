import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { railForm } from '@/lib/studio/kernel/edit-plan'
import {
  PRACTICE_RAIL,
  PRACTICE_COVER_WRITES,
  PRACTICE_PERMALINK_WRITES,
  PRACTICE_SETTINGS_WRITES,
} from './practice-rail-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE PRACTICE RAIL DERIVES FROM ITS MANIFEST (ADR-1240, closing the Practice half of HYG-050).
//
// Three properties, each of which the hand-written rail lacked:
//   1. the rail renders EXACTLY the seven fields it rendered before the derivation, by zone;
//   2. every written column is honoured, so no save path writes a column the rail cannot show;
//   3. a placement change on the manifest changes the rail, with no edit to the module.
// Plus a source-shape guard: the module file declares no field of its own.
// ─────────────────────────────────────────────────────────────────────────────

describe('the Practice rail plan', () => {
  it('renders the same seven fields the hand-written rail rendered, in the same three zones', () => {
    expect(PRACTICE_RAIL.cover.fields.map((f) => f.path)).toEqual(['header_image'])
    expect(PRACTICE_RAIL.settings.fields.map((f) => f.path)).toEqual([
      'title',
      'summary',
      'description',
      'category',
      'duration_min',
    ])
    expect(PRACTICE_RAIL.permalink.fields.map((f) => f.path)).toEqual(['slug'])
  })

  it('honours every written column: nothing a save path writes is missing from the rail', () => {
    expect(PRACTICE_RAIL.cover.dropped).toEqual([])
    expect(PRACTICE_RAIL.settings.dropped).toEqual([])
    expect(PRACTICE_RAIL.permalink.dropped).toEqual([])
  })

  it('writes each column on exactly one save path', () => {
    const all = [...PRACTICE_COVER_WRITES, ...PRACTICE_SETTINGS_WRITES, ...PRACTICE_PERMALINK_WRITES]
    expect(new Set(all).size).toBe(all.length)
  })

  it('reads label, kind, and required from the manifest, never from the module', () => {
    const byPath = new Map(PRACTICE_MANIFEST.fields.map((f) => [f.path, f]))
    for (const zone of Object.values(PRACTICE_RAIL)) {
      for (const f of zone.fields) expect(f).toBe(byPath.get(f.path))
    }
    const title = PRACTICE_RAIL.settings.fields.find((f) => f.path === 'title')
    expect(title?.required).toBe(true)
  })

  it('hosts the inline plane only in the settings form, and only because no inline canvas exists yet', () => {
    // The three content fields are declared inline (they ARE the page) and are hosted by the rail.
    // Drop `hostInline` and they leave: that is the whole change when the canvas lands.
    const unhosted = railForm(PRACTICE_MANIFEST, PRACTICE_SETTINGS_WRITES)
    expect(unhosted.fields.map((f) => f.path)).toEqual(['category', 'duration_min'])
    expect(unhosted.dropped.map((d) => d.path)).toEqual(['title', 'summary', 'description'])
    expect(unhosted.dropped.every((d) => d.reason === 'inline')).toBe(true)
  })

  // THE DRIFT TEST against the real manifest. Change one field's placement and the rail follows.
  it('follows a placement change on the manifest with no change to the module', () => {
    const moved = {
      ...PRACTICE_MANIFEST,
      fields: PRACTICE_MANIFEST.fields.map((f) =>
        f.path === 'duration_min' ? { ...f, placement: 'spark' as const } : f,
      ),
    }
    const form = railForm(moved, PRACTICE_SETTINGS_WRITES, { hostInline: true })
    expect(form.fields.map((f) => f.path)).toEqual(['title', 'summary', 'description', 'category'])
    expect(form.dropped).toEqual([{ path: 'duration_min', reason: 'spark-only' }])
  })
})

describe('the Practice settings module renders the plan, not a field list', () => {
  const source = readFileSync(join(__dirname, 'practice-settings-module.tsx'), 'utf8')

  it('imports the plan and hands its fields to the rail renderer', () => {
    expect(source).toMatch(/from '\.\/practice-rail-plan'/)
    expect(source).toMatch(/fields=\{PRACTICE_RAIL\.settings\.fields\}/)
  })

  it('declares no autosave field of its own (a named Input, Textarea, or Select)', () => {
    // The permalink Input is bound by `value`, never by `name`: it has its own action and is not
    // part of the autosave form. Every other hand-declared control is gone.
    expect(source).not.toMatch(/<(?:Input|Textarea|Select)\b[^>]*\bname=/)
  })

  it('takes even the zone labels from the manifest', () => {
    expect(source).toMatch(/\{COVER\.label\}/)
    expect(source).toMatch(/\{PERMALINK\.label\}/)
  })
})

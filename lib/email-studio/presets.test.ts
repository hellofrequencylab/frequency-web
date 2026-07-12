import { describe, it, expect } from 'vitest'
import { EMAIL_PRESETS, emailPresetByName } from './presets'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'
import { renderEmailLayout } from './render'
import { EMAIL_PALETTE_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { lintVoice } from '@/lib/beta/email'

// Phase 3 presets: every pre-written email preset must be a VALID email `EntityLayout` that survives
// sanitize and renders to non-empty HTML with no thrown error, and its copy must pass the hard voice rule
// (no em dashes anywhere in the authored subject / preheader / block content).

describe('email presets', () => {
  it('ships a healthy set (7 presets), each with the required fields', () => {
    expect(EMAIL_PRESETS.length).toBeGreaterThanOrEqual(6)
    for (const p of EMAIL_PRESETS) {
      expect(p.name).toBeTruthy()
      expect(p.description).toBeTruthy()
      expect(p.category).toBeTruthy()
      expect(p.subject).toBeTruthy()
      expect(typeof p.preheader).toBe('string')
      expect(p.blockJson).toBeTruthy()
      expect(Array.isArray(p.blockJson.rows)).toBe(true)
      expect(p.blockJson.content && Object.keys(p.blockJson.content).length).toBeGreaterThan(0)
    }
  })

  it('has unique names (so seeding by name is idempotent)', () => {
    const names = EMAIL_PRESETS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(emailPresetByName(name)?.name).toBe(name)
  })

  it('every preset sanitizes and renders to non-empty HTML + text', () => {
    for (const p of EMAIL_PRESETS) {
      const clean = sanitizeEntityLayout(p.blockJson, 'email')
      expect(clean, `${p.name} should sanitize to a non-null email layout`).not.toBeNull()
      const { html, text } = renderEmailLayout(clean!)
      expect(html.length, `${p.name} should render non-empty HTML`).toBeGreaterThan(0)
      expect(text.length, `${p.name} should render a non-empty text alternative`).toBeGreaterThan(0)
      // Inline-styled, table-based, no CSS classes / next-image leaked into an email.
      expect(html).toContain('<table')
      expect(html).not.toContain('class=')
    }
  })

  it('uses only curated email-palette blocks, each block id at most once per preset', () => {
    for (const p of EMAIL_PRESETS) {
      const ids = (p.blockJson.rows ?? []).flatMap((r) => r.cells.flat())
      expect(new Set(ids).size, `${p.name} should have unique block ids`).toBe(ids.length)
      for (const id of ids) {
        expect(EMAIL_PALETTE_BLOCK_IDS.has(id), `${p.name} uses non-palette block "${id}"`).toBe(true)
      }
      // Every content key is a placed block id (no orphan content bags).
      for (const key of Object.keys(p.blockJson.content ?? {})) {
        expect(ids, `${p.name} content key "${key}" is not placed`).toContain(key)
      }
    }
  })

  it('carries no em dash in any authored copy (voice hard rule)', () => {
    for (const p of EMAIL_PRESETS) {
      const copy = [p.subject, p.preheader, p.description, JSON.stringify(p.blockJson.content ?? {})].join('\n')
      expect(lintVoice(copy).hasEmDash, `${p.name} copy must not contain an em dash`).toBe(false)
    }
  })
})

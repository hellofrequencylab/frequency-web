import { describe, it, expect } from 'vitest'
import { pickQrStudioConfig, DEFAULT_QR_STUDIO_CONFIG } from './qr-studio'
import { elementDef } from './registry'
import type { ViewerRoleCtx } from './config'

// Locks the QR Studio element's config resolution. pickQrStudioConfig is the PURE fold the async
// resolver runs; feeding it stored-layer fixtures + a viewer role keeps the ROLE GATING honest without a
// database. Unlike the header (display-only), each QR feature is unlocked only for a viewer whose role
// meets its min-role, so the toggles read elementFeatureOn (enabled AND role met).

const DEF = elementDef('qr-studio')
const EMPTY = { platform: {}, space: null }

// Editor-gated features per the registry: eyeColor, gradient, logo, frame. everyone: colors, shapes.
const STAFF: ViewerRoleCtx = { webRole: 'admin' }
const EDITOR: ViewerRoleCtx = { communityRole: 'host' }
const MEMBER: ViewerRoleCtx = { communityRole: 'member' }
const SIGNED_OUT: ViewerRoleCtx = {}

describe('pickQrStudioConfig (qr-studio element config)', () => {
  it('with no stored config, a viewer who meets every role gets the full defaults', () => {
    expect(pickQrStudioConfig(DEF, EMPTY, STAFF)).toEqual(DEFAULT_QR_STUDIO_CONFIG)
    // An editor also meets every feature's min-role here (highest is editor).
    expect(pickQrStudioConfig(DEF, EMPTY, EDITOR)).toEqual(DEFAULT_QR_STUDIO_CONFIG)
  })

  it('role-gates the editor-only features OFF for a viewer who does not meet the role', () => {
    const cfg = pickQrStudioConfig(DEF, EMPTY, MEMBER)
    // everyone-tier controls stay on for a plain member…
    expect(cfg.colors).toBe(true)
    expect(cfg.shapes).toBe(true)
    // …but the editor-tier controls are hidden regardless of their (on) toggle.
    expect(cfg.eyeColor).toBe(false)
    expect(cfg.gradient).toBe(false)
    expect(cfg.logo).toBe(false)
    expect(cfg.frame).toBe(false)
  })

  it('a signed-out viewer meets only the everyone tier', () => {
    const cfg = pickQrStudioConfig(DEF, EMPTY, SIGNED_OUT)
    expect(cfg.colors).toBe(true)
    expect(cfg.shapes).toBe(true)
    expect(cfg.eyeColor).toBe(false)
    expect(cfg.frame).toBe(false)
  })

  it('an operator toggle OFF hides an everyone feature even for a viewer who meets the role', () => {
    const layers = { platform: { settings: { colors: false } }, space: null }
    expect(pickQrStudioConfig(DEF, layers, STAFF).colors).toBe(false)
  })

  it('resolves the presets choice (operator value + per-space override)', () => {
    expect(pickQrStudioConfig(DEF, { platform: { settings: { presets: 'core' } }, space: null }, STAFF).presets).toBe('core')
    // A per-space override beats the platform master.
    const layers = { platform: { settings: { presets: 'full' } }, space: { settings: { presets: 'core' } } }
    expect(pickQrStudioConfig(DEF, layers, STAFF).presets).toBe('core')
  })

  it('ignores a junk stored presets value and falls back to full', () => {
    const layers = { platform: { settings: { presets: 'zillion' } }, space: null }
    expect(pickQrStudioConfig(DEF, layers, STAFF).presets).toBe('full')
  })

  it('returns the fail-safe full config when the def is missing', () => {
    expect(pickQrStudioConfig(null, EMPTY, MEMBER)).toEqual(DEFAULT_QR_STUDIO_CONFIG)
  })
})

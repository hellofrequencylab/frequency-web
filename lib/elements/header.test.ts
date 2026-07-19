import { describe, it, expect } from 'vitest'
import { pickHeaderConfig, DEFAULT_HEADER_CONFIG } from './header'

// Locks the header element's config resolution (ADR-793). pickHeaderConfig is the PURE fold the async
// resolver runs; feeding it stored-layer fixtures keeps precedence honest without a database.

const EMPTY = { platform: {}, space: null }

describe('pickHeaderConfig (header element config)', () => {
  it('with no stored config, uses the registry defaults', () => {
    // Registry defaults: layout overlay, height large, focus/links/scrim on.
    expect(pickHeaderConfig(EMPTY)).toEqual(DEFAULT_HEADER_CONFIG)
  })

  it("a surface's defaults win over the registry when no operator value is set", () => {
    const cfg = pickHeaderConfig(EMPTY, { layout: 'identity', height: 'standard' })
    expect(cfg.layout).toBe('identity')
    expect(cfg.height).toBe('standard')
  })

  it('an operator master value overrides the surface default (retune without deploy)', () => {
    const layers = { platform: { settings: { height: 'tall', layout: 'minimal' } }, space: null }
    const cfg = pickHeaderConfig(layers, { layout: 'identity', height: 'standard' })
    expect(cfg.height).toBe('tall')
    expect(cfg.layout).toBe('minimal')
  })

  it('a per-space override beats the platform master', () => {
    const layers = {
      platform: { settings: { height: 'tall' } },
      space: { settings: { height: 'short' } },
    }
    expect(pickHeaderConfig(layers).height).toBe('short')
  })

  it('a surface can default the overlay (scrim) off, and an operator value still overrides it', () => {
    expect(pickHeaderConfig(EMPTY, { scrim: false }).scrim).toBe(false)
    // Operator turning scrim ON at the master beats the surface's overlay-off default.
    expect(pickHeaderConfig({ platform: { settings: { scrim: true } }, space: null }, { scrim: false }).scrim).toBe(true)
  })

  it('resolves overlayStyle: default shadow, derived from scrim, surface default, and operator override', () => {
    expect(pickHeaderConfig(EMPTY).overlayStyle).toBe('shadow')
    // scrim off with no explicit style → 'none'.
    expect(pickHeaderConfig(EMPTY, { scrim: false }).overlayStyle).toBe('none')
    // a surface default style wins over the scrim derivation.
    expect(pickHeaderConfig(EMPTY, { scrim: false, overlayStyle: 'fade' }).overlayStyle).toBe('fade')
    // an operator master value beats the surface default.
    expect(pickHeaderConfig({ platform: { settings: { overlayStyle: 'fade' } }, space: null }, { overlayStyle: 'none' }).overlayStyle).toBe('fade')
  })

  it('honors the toggles (focus / links / scrim off)', () => {
    const layers = { platform: { settings: { focus: false, links: false, scrim: false } }, space: null }
    const cfg = pickHeaderConfig(layers)
    expect(cfg.focus).toBe(false)
    expect(cfg.links).toBe(false)
    expect(cfg.scrim).toBe(false)
  })

  it('ignores a junk stored height / layout and falls back', () => {
    const layers = { platform: { settings: { height: 'enormous', layout: 'spinny' } }, space: null }
    const cfg = pickHeaderConfig(layers, { height: 'standard', layout: 'identity' })
    expect(cfg.height).toBe('standard')
    expect(cfg.layout).toBe('identity')
  })
})

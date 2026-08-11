// A waiver that matches too broadly is worse than no waiver at all: it turns a named,
// reviewable decision back into a mute button, and it does so silently. These tests are the
// only thing standing between the two, because the mechanism itself runs inside Playwright
// against a live deployment and cannot be exercised here.
//
// Two families of assertion:
//   1. Every DECLARED entry is internally honest — its `ratio` really is the WCAG contrast of
//      the two hexes it names. This catches a typo'd hex or a copied-and-not-updated ratio
//      without needing a browser, which is exactly the failure a hand-maintained colour list
//      invites.
//   2. Every NEAR MISS is rejected — same colours but a different rule, same rule but a
//      different ground, the reversed pair, the shadowed variant of a fill entry, and so on.
import { describe, expect, it } from 'vitest'
import {
  A11Y_WAIVERS,
  contrastColors,
  describeWaived,
  partitionWaived,
  waiverForNode,
  type NodeLike,
  type ViolationLike,
} from './a11y-waivers'

/* ── WCAG 2.1 relative luminance + contrast, mirroring scripts/check-contrast.mjs ──
   Reimplemented rather than imported: that file is a `.mjs` under the `scripts/` tree that
   tsconfig excludes, and the arithmetic is ten lines of standard formula. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = channels.map(lin) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Build the node shape axe hands us for a `color-contrast` failure. */
function node(data: Record<string, unknown>): NodeLike {
  return { any: [{ id: 'color-contrast', data }] }
}

function fillNode(fgColor: string, bgColor: string): NodeLike {
  return node({ fgColor, bgColor, contrastRatio: 1 })
}

function shadowNode(fgColor: string, shadowColor: string, bgColor = '#e2912f'): NodeLike {
  return node({ fgColor, bgColor, shadowColor, messageKey: 'fgOnShadowColor', contrastRatio: 1 })
}

describe('a11y waivers · the declared list', () => {
  it('declares only the one rule the mechanism can reason about', () => {
    for (const waiver of A11Y_WAIVERS) expect(waiver.rule).toBe('color-contrast')
  })

  it('spells every colour as a lowercase 6-digit hex', () => {
    for (const waiver of A11Y_WAIVERS) {
      expect(waiver.fg).toMatch(/^#[0-9a-f]{6}$/)
      expect(waiver.bg ?? waiver.shadow).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('names exactly one ground per entry, never both and never neither', () => {
    for (const waiver of A11Y_WAIVERS) {
      expect(Boolean(waiver.bg) !== Boolean(waiver.shadow)).toBe(true)
    }
  })

  it('carries a decision reference and a reason on every entry', () => {
    for (const waiver of A11Y_WAIVERS) {
      expect(waiver.decision.length).toBeGreaterThan(20)
      expect(waiver.why.length).toBeGreaterThan(20)
    }
  })

  it('holds no duplicate pairs, so a stale entry cannot hide behind a live one', () => {
    const keys = A11Y_WAIVERS.map((w) => `${w.rule}|${w.fg}|${w.bg ?? ''}|${w.shadow ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  // The frozen ratio is what makes the entry auditable: it is the number the owner was shown.
  // If a hex is edited without re-measuring, this fails.
  it('declares a ratio that really is the contrast of the two colours it names', () => {
    for (const waiver of A11Y_WAIVERS) {
      const ground = waiver.bg ?? (waiver.shadow as string)
      const measured = contrast(waiver.fg, ground)
      // A fill is exact (axe truncates to 2dp). A shadow is the blur-weighted composite, which
      // axe rounds to a hex only AFTER measuring, so it reproduces to about a hundredth.
      const tolerance = waiver.bg ? 0.011 : 0.025
      expect(Math.abs(measured - waiver.ratio)).toBeLessThan(tolerance)
    }
  })

  // A waived pair that has climbed past AA is a fix waiting to be noticed, not a waiver.
  it('declares no ratio that already passes the 4.5:1 bar', () => {
    for (const waiver of A11Y_WAIVERS) expect(waiver.ratio).toBeLessThan(4.5)
  })
})

describe('a11y waivers · what matches', () => {
  it('waives the white label on each amber the app actually paints', () => {
    for (const amber of ['#e2912f', '#f2b14e', '#d9852a']) {
      expect(waiverForNode('color-contrast', fillNode('#ffffff', amber))?.bg).toBe(amber)
    }
  })

  it('waives the embossed label against its shadow colour', () => {
    expect(waiverForNode('color-contrast', shadowNode('#ffffff', '#bf7a28'))?.shadow).toBe('#bf7a28')
  })

  it('waives the success chip', () => {
    expect(waiverForNode('color-contrast', fillNode('#11827a', '#d7efea'))).not.toBeNull()
  })

  it('reads colours case-insensitively, as axe may emit either case', () => {
    expect(waiverForNode('color-contrast', fillNode('#FFFFFF', '#E2912F'))).not.toBeNull()
  })
})

describe('a11y waivers · what must NOT match', () => {
  it('never waives a rule other than color-contrast, even with waived colours present', () => {
    expect(waiverForNode('target-size', fillNode('#ffffff', '#e2912f'))).toBeNull()
    expect(waiverForNode('link-in-text-block', fillNode('#ffffff', '#e2912f'))).toBeNull()
  })

  it('never waives the reversed pair: amber TEXT on white is a different decision', () => {
    expect(waiverForNode('color-contrast', fillNode('#e2912f', '#ffffff'))).toBeNull()
    expect(waiverForNode('color-contrast', fillNode('#d9852a', '#ffffff'))).toBeNull()
  })

  it('never waives the same foreground on an undeclared ground', () => {
    // The marketing canvas and the midnight canvas are real, unwaived debt.
    expect(waiverForNode('color-contrast', fillNode('#ffffff', '#b07515'))).toBeNull()
    expect(waiverForNode('color-contrast', fillNode('#362f24', '#211a10'))).toBeNull()
  })

  it('never waives a declared amber that the harness proved never paints', () => {
    // `.dark [data-skin="midnight"]`'s #F0AD4E: declared in globals.css, never rendered,
    // deliberately absent from the list.
    expect(waiverForNode('color-contrast', fillNode('#ffffff', '#f0ad4e'))).toBeNull()
  })

  it('does not let a fill entry swallow the shadowed measurement of the same button', () => {
    const unknownShadow = shadowNode('#ffffff', '#123456')
    expect(waiverForNode('color-contrast', unknownShadow)).toBeNull()
  })

  it('does not let a shadow entry cover axe’s shadow-versus-background comparison', () => {
    const other = node({
      fgColor: '#ffffff',
      bgColor: '#e2912f',
      shadowColor: '#bf7a28',
      messageKey: 'shadowOnBgColor',
    })
    expect(waiverForNode('color-contrast', other)).toBeNull()
  })

  it('never waives a node whose colours axe could not report', () => {
    expect(waiverForNode('color-contrast', node({ fgColor: undefined, bgColor: '#e2912f' }))).toBeNull()
    expect(waiverForNode('color-contrast', node({ fgColor: '#ffffff', bgColor: undefined }))).toBeNull()
    expect(waiverForNode('color-contrast', { any: [] })).toBeNull()
    expect(waiverForNode('color-contrast', {})).toBeNull()
  })

  it('never waives a colour written in a form the list does not spell out', () => {
    expect(waiverForNode('color-contrast', fillNode('#ffffff', 'rgb(226, 145, 47)'))).toBeNull()
    expect(waiverForNode('color-contrast', fillNode('#ffffff', '#e2912fff'))).toBeNull()
    expect(waiverForNode('color-contrast', fillNode('#fff', '#e2912f'))).toBeNull()
  })

  it('ignores colour data hanging off a different check on the same node', () => {
    const misfiled: NodeLike = {
      any: [{ id: 'color-contrast-enhanced', data: { fgColor: '#ffffff', bgColor: '#e2912f' } }],
    }
    expect(waiverForNode('color-contrast', misfiled)).toBeNull()
  })
})

describe('a11y waivers · partitioning', () => {
  const violation = (id: string, nodes: NodeLike[]): ViolationLike => ({ id, nodes })

  it('subtracts only waived nodes and keeps the rest of the same violation', () => {
    const result = partitionWaived([
      violation('color-contrast', [
        fillNode('#ffffff', '#e2912f'), // waived
        fillNode('#e2912f', '#ffffff'), // real: amber as display text, on white
        fillNode('#e2912f', '#f5eee2'), // real: amber as display text, on the canvas band
      ]),
    ])
    expect(result.waivedCount).toBe(1)
    expect(result.keptCount).toBe(2)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].nodes).toHaveLength(2)
  })

  it('drops a violation whose nodes are all waived', () => {
    const result = partitionWaived([
      violation('color-contrast', [fillNode('#ffffff', '#f2b14e'), fillNode('#ffffff', '#f2b14e')]),
    ])
    expect(result.kept).toHaveLength(0)
    expect(result.keptCount).toBe(0)
    expect(result.waivedCount).toBe(2)
  })

  it('leaves a target-size violation completely untouched', () => {
    const targets = violation('target-size', [{ any: [{ id: 'target-size', data: {} }] }])
    const result = partitionWaived([targets])
    expect(result.keptCount).toBe(1)
    expect(result.waivedCount).toBe(0)
  })

  it('tallies per entry so every run prints what it is standing on', () => {
    const result = partitionWaived([
      violation('color-contrast', [
        fillNode('#ffffff', '#e2912f'),
        fillNode('#ffffff', '#e2912f'),
        fillNode('#11827a', '#d7efea'),
      ]),
    ])
    expect(result.waived.map((w) => w.count)).toEqual([2, 1])
    expect(describeWaived(result.waived[0])).toContain('#ffffff on #e2912f')
    expect(describeWaived(result.waived[0])).toContain('2026-08-06')
  })

  it('is a no-op on an empty list', () => {
    const result = partitionWaived([])
    expect(result).toEqual({ kept: [], keptCount: 0, waived: [], waivedCount: 0 })
  })
})

describe('a11y waivers · colour extraction', () => {
  it('returns null when the node carries no color-contrast check', () => {
    expect(contrastColors({ any: [{ id: 'target-size', data: {} }] })).toBeNull()
  })

  it('normalises what it can and nulls what it cannot', () => {
    const colors = contrastColors(node({ fgColor: '#FFFFFF', bgColor: 'transparent' }))
    expect(colors).toEqual({ fg: '#ffffff', bg: null, shadow: null, messageKey: null })
  })
})

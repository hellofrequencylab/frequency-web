import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConsoleThumbBar } from './console-thumb-bar'
import { THUMB_ACTION_IDS, THUMB_ACTION_MAX, thumbActionsFor } from '@/lib/spaces/console-thumb'
import { resolveSpaceMenu } from '@/lib/admin/modules/space-menu'
import { spaceModuleById } from '@/lib/admin/modules/space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'

// LIVE-704 (ADR-1639): the Space console on a phone. The consequence the row asks for is "the daily
// operator doors are reachable with a thumb", which is three facts: the doors come from the catalog the
// console already gated (so the menu contract holds), they sit in slot 0c of the mobile stacking
// contract (so the tab bar and its risers never cover them), and each is a 44px target.

const allOn = resolveSpaceMenu({ canUse: () => true, canManageMenu: true })

describe('thumbActionsFor', () => {
  it('names only real catalog rows, so every thumb door traces to SPACE_MODULES', () => {
    for (const id of THUMB_ACTION_IDS) expect(spaceModuleById(id), id).toBeTruthy()
  })

  it('gives an owner with every tool on the four daily doors, each with the href the console row uses', () => {
    const actions = thumbActionsFor(allOn, 'acme')
    expect(actions.map((a) => a.module.id).sort()).toEqual([...THUMB_ACTION_IDS].sort())
    for (const a of actions) expect(a.href).toBe(panelHrefForModule(a.module, 'acme'))
    expect(actions.length).toBeLessThanOrEqual(THUMB_ACTION_MAX)
  })

  it('drops a door the viewer cannot use, exactly as the console drops its row', () => {
    const noShop = resolveSpaceMenu({ canUse: (fn) => fn !== 'shop', canManageMenu: true })
    const ids = thumbActionsFor(noShop, 'acme').map((a) => a.module.id)
    expect(ids).not.toContain('space.services')
    expect(ids).toContain('space.people')
  })

  it('drops a door the owner hid in the Module Manager', () => {
    const hidden = resolveSpaceMenu({ canUse: () => true, canManageMenu: true }, { hidden: ['space.comms'] })
    expect(thumbActionsFor(hidden, 'acme').map((a) => a.module.id)).not.toContain('space.comms')
  })

  it('follows the resolved menu order, not its own list', () => {
    const reversed = [...allOn].reverse()
    const ids = thumbActionsFor(reversed, 'acme').map((a) => a.module.id)
    const expected = reversed.map((m) => m.id).filter((id) => THUMB_ACTION_IDS.includes(id))
    expect(ids).toEqual(expected)
  })

  it('declares no label, icon or href of its own (MENU-CONTRACT: no hand-typed menu row)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/spaces/console-thumb.ts'), 'utf8')
    expect(src).not.toMatch(/\blabel\s*:\s*['"]/)
    expect(src).not.toMatch(/\bhref\s*:\s*['"`]/)
  })
})

describe('ConsoleThumbBar', () => {
  const html = renderToStaticMarkup(<ConsoleThumbBar actions={thumbActionsFor(allOn, 'acme')} />)

  it('renders nothing when the viewer has no daily door', () => {
    expect(renderToStaticMarkup(<ConsoleThumbBar actions={[]} />)).toBe('')
  })

  it('is phone-only and sits in slot 0c: flush on the tab bar, controls padded clear of the lane', () => {
    expect(html).toContain('md:hidden')
    expect(html).toContain('fixed inset-x-0 bottom-[var(--tab-bar-h)]')
    expect(html).toContain('pb-[calc(var(--lane-rise)+0.5rem)]')
    // Rule 3's offset is the wrong number for a full-bleed bar (the 2026-08-31 gap).
    expect(html).not.toContain('bottom-[var(--tab-bar-clearance)]')
  })

  it('draws every door as a 44px target with the catalog label', () => {
    const links = html.match(/<a [^>]*>/g) ?? []
    expect(links.length).toBe(THUMB_ACTION_IDS.length)
    for (const a of links) expect(a).toContain('min-h-[44px]')
    for (const id of THUMB_ACTION_IDS) expect(html).toContain(`>${spaceModuleById(id)!.label}<`)
  })

  it('carries no hover-only affordance and no hard-coded colour', () => {
    expect(html).not.toMatch(/\bhover:/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

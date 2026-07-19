import { describe, it, expect } from 'vitest'
import { elementViolations } from './check-elements.mjs'

// Locks the embeddable-elements contract guard (ADR-792, docs/EMBEDDABLE-ELEMENTS.md). elementViolations
// is the pure classifier the CLI runs; feeding it fixture strings keeps the guard honest without
// touching the filesystem (mirrors scripts/check-menu.test.ts).

// A file that forks the catalog must import OUR ElementDef; the fixtures include that import so the
// guard (which keys on the import, not the type name) sees them as real forks.
const IMPORT = "import type { ElementDef } from '@/lib/elements/registry'\n"

describe('check-elements (embeddable-elements contract guard)', () => {
  it('flags a second ElementDef[] catalog outside the registry', () => {
    const v = elementViolations('lib/widgets/my-elements.ts', IMPORT + 'const MORE: ElementDef[] = [\n]\n')
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('parallel-catalog')
  })

  it('flags a readonly ElementDef[] catalog fork too', () => {
    const v = elementViolations('components/x.tsx', IMPORT + 'const X: readonly ElementDef[] = []\n')
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('parallel-catalog')
  })

  it('flags direct element_settings table access outside the store', () => {
    const v = elementViolations('app/(main)/foo/actions.ts', "const q = db.from('element_settings').select('*')\n")
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('table-access')
  })

  it('allows the canonical catalog + store at their source paths', () => {
    expect(elementViolations('lib/elements/registry.ts', 'export const ELEMENTS: readonly ElementDef[] = []\n')).toHaveLength(0)
    expect(elementViolations('lib/elements/store.ts', "from('element_settings')\n")).toHaveLength(0)
  })

  it('does not flag an unrelated ElementDef of the same name (not imported from our registry)', () => {
    // lib/library/element-catalog.ts defines its OWN local ElementDef (illustration assets). Without
    // the registry import, the guard leaves it alone.
    const src = 'export type ElementDef = { name: string }\nconst ICONS: ElementDef[] = []\n'
    expect(elementViolations('lib/library/element-catalog.ts', src)).toHaveLength(0)
  })

  it('does not flag an unrelated local named ELEMENTS', () => {
    expect(elementViolations('app/(marketing)/lead-funnel-kit/page.tsx', 'const ELEMENTS: { name: string }[] = []\n')).toHaveLength(0)
  })

  it('does not flag element_settings mentioned in a comment', () => {
    expect(elementViolations('lib/x.ts', '// reads the element_settings master row\n')).toHaveLength(0)
  })

  it('honors the // element-ok: escape hatch', () => {
    const v = elementViolations('lib/x.ts', IMPORT + "const Y: ElementDef[] = [] // element-ok: fixture, not a real catalog\n")
    expect(v).toHaveLength(0)
  })
})

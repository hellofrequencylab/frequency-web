import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { memberDesignBranches, memberDesignBranchReport } from './lib/member-design-branches.mjs'

const selector = "import { SITE_DESIGN } from '@/lib/theme/design';"
describe('member platform-design branch guard', () => {
  it('accepts current route modules, including the retained label and anonymous policy', () => {
    const report = memberDesignBranchReport()
    expect(report.scanned).toBeGreaterThan(900)
    expect(report.failures).toEqual([])
  })
  it.each(['root', 'feed'])('rejects the actual retired %s route statement', name => {
    const source = readFileSync(`scripts/fixtures/member-design-branches/retired-${name}.txt`, 'utf8')
    const failures = memberDesignBranches(source, name)
    expect(failures.some(failure => failure.expression.startsWith("SITE_DESIGN === 'frequency'"))).toBe(true)
    expect(failures.some(failure => failure.expression.startsWith('Parse error:'))).toBe(false)
  })
  it.each([
    `${selector} if (SITE_DESIGN === 'dawn') return <Dawn />`,
    `${selector} const isFrequency = SITE_DESIGN === 'frequency'; const alias = isFrequency; return alias ? <Frequency /> : <Dawn />`,
    "import { SITE_DESIGN as platform } from '@/lib/theme/design'; return platform === 'frequency' && <Frequency />",
    "const theme = await import('@/lib/theme/design'); return theme.SITE_DESIGN === 'dawn' ? <Dawn /> : <Frequency />",
    "import * as theme from '@/lib/theme/design'; switch(theme.SITE_DESIGN) { case 'dawn': return <Dawn /> }",
    "const { NEXT_PUBLIC_SITE_DESIGN: design } = process.env; return design === 'dawn' ? <Dawn /> : <Frequency />",
    `${selector} function current() { return SITE_DESIGN }; if(current() === 'dawn') return <Dawn />`,
    "const selection = process.env.NEXT_PUBLIC_SITE_DESIGN; if(selection === 'dawn') return <Dawn />",
    "return process.env['NEXT_PUBLIC_SITE_DESIGN'] === 'dawn' ? <Dawn /> : <Frequency />",
    "import { LEGACY_THEME_AXES } from '@/lib/theme/design'; return LEGACY_THEME_AXES && <Legacy />",
    "import { resolveDesign } from '@/lib/theme/design'; const selected = resolveDesign('dawn'); return selected === 'dawn' ? <Dawn /> : <Frequency />",
  ])('rejects executable direct, alias, namespace and environment variants', source => {
    expect(memberDesignBranches(source)).not.toEqual([])
  })
  it('fails closed on unparseable route source', () => {
    expect(memberDesignBranches('const selection = ;')).not.toEqual([])
  })
  it('ignores stale prose but preserves display labels and the trusted anonymous predicate', () => {
    expect(memberDesignBranches(`${selector}
      import { designDef } from '@/lib/theme/design';
      import { isAnonShellFeed } from '@/lib/nav/anon-feed';
      // if (SITE_DESIGN === 'dawn') return <Dawn />
      const label = designDef(SITE_DESIGN).label;
      if (isAnonShellFeed(pathname, SITE_DESIGN)) return <Anonymous />;
      return <h1>{label}</h1>;`)).toEqual([])
  })
})

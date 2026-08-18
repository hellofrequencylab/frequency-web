import { describe, it, expect } from 'vitest'
import {
  auditNames,
  discoverWrappers,
  runAudit,
  KIT_CONTROLS,
  MIN_FILES,
  MIN_JUDGED,
  MIN_WRAPPERS,
} from './check-a11y-names.mjs'

// The ACCESSIBLE-NAME gate. Its true-positive half is easy to write and worth little on its own:
// LIVE-033 arrived carrying a scan that found "143 controls across 67 files", of which 126 were
// correct code. So the FALSE-POSITIVE half below is the half that decides whether anyone keeps
// this gate — every naming path the accessible-name computation has gets a test that must stay
// silent, because a gate that fires on `<Field label="Name"><Input /></Field>` gets an allowlist
// and then gets ignored (ADR-970).

/** The kit names this file's fixtures use, as they would resolve after an import. */
const KIT = {
  wrapperNames: new Set(['Field']),
  kitKinds: new Map([
    ['Input', 'input'],
    ['Textarea', 'textarea'],
    ['Button', 'button'],
    ['Checkbox', 'checkbox'],
    ['Switch', 'switch'],
  ]),
}
const LUCIDE = "import { X, Check, Loader2 } from 'lucide-react'\n"
const fails = (src: string, ctx: object = KIT) => auditNames(src, ctx).violations

describe('check:a11y-names — controls that genuinely have no name', () => {
  it('flags an icon-only <button>', () => {
    // The single biggest real class: 13 of the 17 found on the live tree were this. A lucide icon
    // renders <svg> with no <title>, so the control announces as "button" and nothing else.
    expect(fails(`${LUCIDE}<button onClick={close}><X className="h-4 w-4" /></button>`)).toHaveLength(1)
  })

  it('flags an icon-only kit <Button>', () => {
    expect(fails(`${LUCIDE}<Button variant="ghost" onClick={cancel}><X /></Button>`)).toHaveLength(1)
  })

  it('flags a button whose only child is a ternary between two icons', () => {
    // Without recursing into both branches this reads as an unknowable expression and walks
    // straight through — the exact shape a "does it have any expression child" scan misses.
    expect(fails(`${LUCIDE}<button>{busy ? <Loader2 /> : <Check />}</button>`)).toHaveLength(1)
  })

  it('flags a bare <Input> with no label, placeholder or aria-label', () => {
    expect(fails('<div><span className={lbl}>URL</span><Input value={v} onChange={f} /></div>')).toHaveLength(1)
  })

  it('flags a <div role="button">, which is a button to a screen reader', () => {
    expect(fails(`${LUCIDE}<div role="button" onClick={go}><X /></div>`)).toHaveLength(1)
  })

  it('flags an sr-only <input>, which IS in the accessibility tree', () => {
    // Two of the live findings were these. `sr-only` is visible to a screen reader; only
    // `display:none` is not, and conflating the two would have hidden both.
    expect(fails('<input type="file" className="sr-only" onChange={f} />')).toHaveLength(1)
  })

  it('reports file, line and tag, so the message is actionable', () => {
    const { violations } = auditNames(`${LUCIDE}\n\n<button><X /></button>`, KIT, 'app/x/page.tsx')
    expect(violations[0].line).toBe(4)
    expect(violations[0].tag).toBe('button')
  })
})

describe('check:a11y-names — every naming path, which must stay silent', () => {
  it('passes visible text content', () => {
    expect(fails('<button onClick={f}>Publish</button>')).toHaveLength(0)
  })

  it('passes visible text sitting beside an icon', () => {
    expect(fails(`${LUCIDE}<button><X className="h-4 w-4" aria-hidden /> Remove</button>`)).toHaveLength(0)
  })

  it('passes an sr-only span, the icon-button pattern that needs no aria-label', () => {
    expect(fails(`${LUCIDE}<button><X aria-hidden /><span className="sr-only">Close</span></button>`)).toHaveLength(0)
  })

  it('passes aria-label', () => {
    expect(fails(`${LUCIDE}<button aria-label="Close"><X /></button>`)).toHaveLength(0)
  })

  it('passes aria-labelledby', () => {
    expect(fails(`${LUCIDE}<p id="t">Close</p><button aria-labelledby="t"><X /></button>`)).toHaveLength(0)
  })

  it('passes title', () => {
    expect(fails(`${LUCIDE}<button title="Close"><X /></button>`)).toHaveLength(0)
  })

  it('passes an <svg><title>', () => {
    expect(fails('<button><svg viewBox="0 0 1 1"><title>Close</title><path d="M0 0" /></svg></button>')).toHaveLength(0)
  })

  it('passes a control wrapped in a native <label>', () => {
    expect(fails('<label className="block"><span className={lbl}>Name</span><Input value={v} /></label>')).toHaveLength(0)
  })

  it('passes a control wrapped in the <Field> primitive', () => {
    // THE false positive that would have killed this gate. The 143-candidate scan LIVE-033 was
    // filed from could not resolve label-wrapping components, and this shape is 283 controls.
    expect(fails('<Field label="Board name"><Input value={v} onChange={f} /></Field>')).toHaveLength(0)
  })

  it('passes an explicit htmlFor pointing at the control', () => {
    expect(fails('<label htmlFor="slug">Slug</label><input id="slug" value={v} />')).toHaveLength(0)
  })

  it('passes a placeholder, which is what axe-core 4.13 accepts', () => {
    expect(fails('<Input placeholder="Search members" value={v} />')).toHaveLength(0)
  })

  it('passes a Checkbox named by its own label prop', () => {
    expect(fails('<Checkbox label="Email me" checked={v} onChange={f} />')).toHaveLength(0)
  })

  it('passes a control carrying a spread, because the name may arrive in the props', () => {
    expect(fails(`${LUCIDE}<button {...props}><X /></button>`)).toHaveLength(0)
  })

  it('passes a button whose child is an unknowable expression', () => {
    expect(fails('<button>{label}</button>')).toHaveLength(0)
  })

  it('passes an <a> with no href, which is not a control', () => {
    expect(fails(`${LUCIDE}<a className="x"><X /></a>`)).toHaveLength(0)
  })

  it('passes anything display:none or aria-hidden, which is not in the tree at all', () => {
    expect(fails('<input type="file" className="hidden" onChange={f} />')).toHaveLength(0)
    expect(fails('<input type="hidden" name="id" value={v} />')).toHaveLength(0)
    expect(fails(`${LUCIDE}<button aria-hidden tabIndex={-1}><X /></button>`)).toHaveLength(0)
    expect(fails(`${LUCIDE}<div className="hidden"><button><X /></button></div>`)).toHaveLength(0)
  })

  it('is not fooled by overflow-hidden or a responsive sm:hidden', () => {
    // Both contain the token "hidden" and NEITHER is display:none at every size. Treating them as
    // removed from the tree would silently excuse every control inside them.
    expect(fails(`${LUCIDE}<div className="overflow-hidden"><button><X /></button></div>`)).toHaveLength(1)
    expect(fails(`${LUCIDE}<button className="sm:hidden"><X /></button>`)).toHaveLength(1)
  })

  it('does not judge a LOCAL component that merely shares a kit name', () => {
    // Resolution is by import, like check-labels.mjs's `Label`. An unresolved `Button` is an
    // unknown component, and unknowable is not a violation.
    expect(auditNames(`${LUCIDE}<Button><X /></Button>`, { wrapperNames: new Set(), kitKinds: new Map() }).violations)
      .toHaveLength(0)
  })
})

describe('check:a11y-names — wrapper discovery', () => {
  const wrapperSrc = `
    export function Labeled({ label, children }: Props) {
      return <label className="block"><span>{label}</span>{children}</label>
    }`

  it('finds a component that wraps its children in a <label>', () => {
    const found = discoverWrappers(new Map([['components/x.tsx', wrapperSrc]]), () => false)
    expect([...found]).toEqual(['components/x.tsx::Labeled'])
  })

  it('follows the wrapper through an import, so the caller is silent', () => {
    const files = new Map([
      ['components/x.tsx', wrapperSrc],
      ['app/p.tsx', "import { Labeled } from '@/components/x'\n<Labeled label='Name'><Input /></Labeled>"],
    ])
    const wrappers = discoverWrappers(files, (p) => files.has(String(p)))
    expect(wrappers.has('components/x.tsx::Labeled')).toBe(true)
  })

  it('reaches a wrapper built out of another wrapper (the fixpoint)', () => {
    const files = new Map([
      ['components/x.tsx', wrapperSrc],
      [
        'components/y.tsx',
        "import { Labeled } from '@/components/x'\nexport function Row({ label, children }) { return <Labeled label={label}>{children}</Labeled> }",
      ],
    ])
    const wrappers = discoverWrappers(files, (p) => files.has(String(p)))
    expect(wrappers.has('components/y.tsx::Row')).toBe(true)
  })
})

describe('check:a11y-names — against the REAL tree', () => {
  const result = runAudit()

  it('scans the repo, so this suite cannot pass over nothing', () => {
    expect(result.files).toBeGreaterThanOrEqual(MIN_FILES)
    expect(result.judged).toBeGreaterThanOrEqual(MIN_JUDGED)
    expect(result.wrappers.size).toBeGreaterThanOrEqual(MIN_WRAPPERS)
  })

  it('every control in app/ + components/ has an accessible name', () => {
    const shown = result.violations.slice(0, 20).map((v) => `${v.file}:${v.line} <${v.tag}>`).join('\n')
    expect(result.violations.length, `unnamed controls:\n${shown}`).toBe(0)
  })

  it('names controls through every path, not just one', () => {
    // The distribution IS the evidence that the resolver works. If `wrapping label` or `contents`
    // collapsed to zero, the violation list would explode; if they swallowed everything, the gate
    // would be vacuous. Both halves have to be non-trivial for green to mean anything.
    expect(result.named.get('contents') ?? 0).toBeGreaterThan(1000)
    expect(result.named.get('wrapping label') ?? 0).toBeGreaterThan(100)
    expect(result.named.get('aria-label') ?? 0).toBeGreaterThan(500)
  })

  it('resolves the kit primitives it claims to judge', () => {
    for (const key of KIT_CONTROLS.keys()) {
      const [file] = key.split('::')
      expect(result.files, `${file} must exist for KIT_CONTROLS to mean anything`).toBeGreaterThan(0)
    }
    expect(KIT_CONTROLS.size).toBeGreaterThanOrEqual(6)
  })
})

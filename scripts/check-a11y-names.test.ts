import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  auditNames,
  discoverForwarders,
  discoverWrappers,
  placeholderCeiling,
  propBehindIdentifier,
  runAudit,
  KIT_CONTROLS,
  MAX_PLACEHOLDER_ONLY,
  MIN_FILES,
  MIN_FORWARDERS,
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

describe('check:a11y-names — the weak-name ratchet', () => {
  // A placeholder-only control is not a violation (axe-core accepts a non-empty placeholder, so
  // failing on it would be stricter than the e2e pass and get routed around — ADR-970). It is
  // RATCHETED instead. These are the tests that say the ratchet is wired, because a fail-safe
  // nobody has watched fire is a fail-safe nobody knows is there.

  it('🔴 FIRES when the count rises above the ceiling — the positive control', () => {
    const verdict = placeholderCeiling(MAX_PLACEHOLDER_ONLY + 1)
    expect(verdict.over).toBe(true)
    expect(verdict.delta).toBe(1)
  })

  it('is silent AT the ceiling, so holding the line is not a failure', () => {
    expect(placeholderCeiling(MAX_PLACEHOLDER_ONLY).over).toBe(false)
  })

  it('is silent BELOW the ceiling, and reports how far there is to re-seed', () => {
    const verdict = placeholderCeiling(MAX_PLACEHOLDER_ONLY - 10)
    expect(verdict.over).toBe(false)
    expect(verdict.delta).toBe(-10)
  })

  it('the ceiling is a number the repo can actually meet', () => {
    const weak = runAudit().named.get('placeholder (weak)') ?? 0
    expect(weak, 'lower MAX_PLACEHOLDER_ONLY in the same change that lowers the count').toBeLessThanOrEqual(
      MAX_PLACEHOLDER_ONLY,
    )
  })

  it('the tally and the collected sites are the same fact, counted twice', () => {
    // The ceiling is applied to `weak.length`; the run PRINTS `named.get('placeholder (weak)')`.
    // If those two ever drift, the number in the failure message stops pointing at the files in it.
    const { named, weak } = runAudit()
    expect(weak.length).toBe(named.get('placeholder (weak)') ?? 0)
  })
})

describe('check:a11y-names — placeholder is the LAST naming path, not the first', () => {
  // 🔴 THE REGRESSION THIS PINS. The placeholder test used to sit ahead of `htmlFor`, `wrapping
  // label` and `contents`, so a properly labelled field WITH a placeholder scored
  // `placeholder (weak)`. That inflated the printed number from 87 to 429 and made the ratchet
  // above meaningless — it would have been guarding 347 controls that were never at risk. Move
  // the check back up the chain and these three go red.

  const via = (src: string) => {
    const { named } = auditNames(src, KIT)
    return [...named.keys()]
  }

  it('an explicit <label htmlFor> beats the placeholder', () => {
    expect(via('<div><label htmlFor="city">City</label><Input id="city" placeholder="City" /></div>')).toEqual([
      'htmlFor',
    ])
  })

  it('a wrapping <Field label> beats the placeholder', () => {
    expect(via('<Field label="Title"><Input placeholder="e.g. Wednesday Ride" /></Field>')).toEqual([
      'wrapping label',
    ])
  })

  it('an aria-label beats the placeholder', () => {
    expect(via('<Input aria-label="Journey title" placeholder="Name your Journey" />')).toEqual(['aria-label'])
  })

  it('and a placeholder ALONE is still counted as the weak name it is', () => {
    expect(via('<Input placeholder="Street address" />')).toEqual(['placeholder (weak)'])
  })
})

describe('check:a11y-names — forwarder discovery (HYG-018, ADR-1126)', () => {
  // The symmetric half of wrapper discovery. `discoverWrappers` handles the component that puts
  // its children INSIDE a <label>; this handles the one that renders `<Label htmlFor={id}>` as a
  // SIBLING and takes the id from its caller. Before it existed the caller's literal never reached
  // `fors`, and one correctly labelled control on the live tree read as placeholder-only.

  const labelSrc = `
    export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
      return <label className={cn(labelClasses, className)} {...props} />
    }`
  const fieldSrc =
    "import { Label } from '@/components/ui/label'\n" +
    'export function Field({ id, label, children }: Props) {\n' +
    '  return <div><Label htmlFor={id}>{label}</Label>{children}</div>\n' +
    '}'

  it('finds the SPREAD shape, which is the seed the whole chain hangs off', () => {
    // `components/ui/field.tsx`'s own Label never writes `htmlFor`: it spreads the rest of its
    // props onto a <label>. Miss this and nothing downstream is ever discovered.
    const found = discoverForwarders(new Map([['components/ui/label.tsx', labelSrc]]), () => false)
    expect([...found]).toEqual([['components/ui/label.tsx::Label', 'htmlFor']])
  })

  it('🔴 MUTATION — take the spread away and the seed is gone, so the chain finds nothing', () => {
    // The positive control for rule (b). This is the mutation that matters: a Label that renders a
    // <label> but does not pass anything through is NOT a forwarder, and publishing it as one would
    // hand every caller a name it does not have.
    const inert = labelSrc.replace('{...props}', 'children={children}')
    expect(discoverForwarders(new Map([['components/ui/label.tsx', inert]]), () => false).size).toBe(0)
  })

  it('follows the chain through an import to a fixpoint: label -> Label -> Field -> TextField', () => {
    const files = new Map([
      ['components/ui/label.tsx', labelSrc],
      ['components/spaces/space-form.tsx', fieldSrc],
      [
        'components/spaces/text-field.tsx',
        "import { Field } from '@/components/spaces/space-form'\n" +
          'export function TextField({ id, label }: Props) { return <Field id={id} label={label}><input id={id} /></Field> }',
      ],
    ])
    const found = discoverForwarders(files, (f) => files.has(String(f)))
    expect(found.get('components/ui/label.tsx::Label')).toBe('htmlFor')
    expect(found.get('components/spaces/space-form.tsx::Field')).toBe('id')
    expect(found.get('components/spaces/text-field.tsx::TextField')).toBe('id')
  })

  it('reads the prop through a RENAMED destructure, so the caller-side name is the right one', () => {
    const files = new Map([
      ['components/ui/label.tsx', labelSrc],
      [
        'components/r.tsx',
        "import { Label } from '@/components/ui/label'\n" +
          'export function Row({ htmlFor: forId, label }: Props) { return <div><Label htmlFor={forId}>{label}</Label></div> }',
      ],
    ])
    const found = discoverForwarders(files, (f) => files.has(String(f)))
    expect(found.get('components/r.tsx::Row')).toBe('htmlFor')
  })

  it('🔴 MUTATION — a LOCAL that SHADOWS a prop of the same name is not a forwarded prop', () => {
    // The direction of error that COSTS findings instead of creating them, and the only shape in
    // which it can happen: an inner scope declares `const id` while the component also HAS a prop
    // called `id`. Walk up naively and the row below reports "Rows forwards `id`", so every
    // `<Rows id="x">` call site contributes a phantom `x` to `fors` and can silently name an
    // unnamed control. Scanning the body for a shadowing declaration BEFORE the parameters is what
    // stops it. Delete that check and this test is the one that goes red.
    const files = new Map([
      ['components/ui/label.tsx', labelSrc],
      [
        'components/rows.tsx',
        "import { Label } from '@/components/ui/label'\n" +
          'export function Rows({ id, rows }: Props) {\n' +
          '  return <fieldset id={id}>{rows.map((r) => { const id = r.key; return <Label htmlFor={id}>{r.label}</Label> })}</fieldset>\n' +
          '}',
      ],
    ])
    const found = discoverForwarders(files, (f) => files.has(String(f)))
    expect(found.has('components/rows.tsx::Rows')).toBe(false)
  })

  it('resolves a prop, a rest and a whole props object, and nothing else', () => {
    const one = (src: string) => {
      const found = discoverForwarders(new Map([['c.tsx', src]]), () => false)
      return found.get('c.tsx::C') ?? null
    }
    expect(one('export function C({ id }) { return <label htmlFor={id} /> }')).toBe('id')
    expect(one('export function C({ label, ...rest }) { return <label {...rest}>{label}</label> }')).toBe('htmlFor')
    expect(one('export function C(props) { return <label {...props} /> }')).toBe('htmlFor')
    // A computed value is not a prop and is not forwarded.
    expect(one('export function C() { return <label htmlFor={`row-${n}`} /> }')).toBe(null)
  })
})

describe('check:a11y-names — the forwarded label reaches the caller (HYG-018, ADR-1126)', () => {
  // NB `Field` here is components/spaces/space-form.tsx's Field, which does NOT wrap its children
  // in a <label> — it renders `<Label htmlFor={id}>` beside them. So no wrapperNames: the whole
  // question is whether the FORWARDED htmlFor is resolved, and a stray wrapper entry would answer
  // it by accident.
  const CTX = { kitKinds: KIT.kitKinds, wrapperNames: new Set<string>() }
  const FWD = { ...CTX, forwarderProps: new Map([['Field', 'id']]) }

  it('names a control whose <label htmlFor> lives one component away', () => {
    const src =
      '<Field id="biz-what" label="What do you do?"><Textarea id="biz-what" placeholder="I teach yoga." /></Field>'
    expect(auditNames(src, FWD).violations).toHaveLength(0)
    expect([...auditNames(src, FWD).named.keys()]).toEqual(['htmlFor'])
  })

  it('🔴 MUTATION — WITHOUT the forwarder map the same control scores placeholder-only', () => {
    // The exact defect, reconstructed. This is what the live tree printed on 2026-08-24: one
    // finding, and the finding was correct code. If forwarder resolution regresses, this fixture
    // is what it regresses to — and at MAX_PLACEHOLDER_ONLY = 0 the ratchet fires on it.
    const src =
      '<Field id="biz-what" label="What do you do?"><Textarea id="biz-what" placeholder="I teach yoga." /></Field>'
    const blind = auditNames(src, { ...CTX, forwarderProps: new Map() })
    expect(blind.weak).toHaveLength(1)
    expect(placeholderCeiling(blind.weak.length).over).toBe(true)
  })

  it('a forwarder cannot name a control the caller never gave an id to', () => {
    // `fors` only ever grows by the LITERAL the caller wrote. A Field with no id contributes
    // nothing, so an unnamed sibling stays a finding rather than being absorbed by the resolver.
    const src = '<Field label="Notes"><span className={lbl}>Notes</span><Input value={v} onChange={f} /></Field>'
    expect(auditNames(src, { ...FWD }).violations)
      .toHaveLength(1)
  })

  it('propBehindIdentifier is exported so the resolution can be argued about directly', () => {
    expect(typeof propBehindIdentifier).toBe('function')
  })
})

describe('check:a11y-names — forwarding, against the REAL tree', () => {
  const result = runAudit()

  it('resolves the forwarder chain it claims to, seed included', () => {
    expect(result.forwarders.size).toBeGreaterThanOrEqual(MIN_FORWARDERS)
    // The seed. Lose the `{...props}` spread rule and this one goes, taking the chain with it.
    expect(result.forwarders.get('components/ui/field.tsx::Label')).toBe('htmlFor')
    expect(result.forwarders.get('components/spaces/space-form.tsx::Field')).toBe('id')
  })

  it('🔴 MUTATION — the live call site is really named this way, not by luck', () => {
    // Audit the real business-quickstart file twice: once with the forwarder map the run builds,
    // once blind. Blind, it is the single placeholder-only control that held the ceiling at 1.
    const file = 'app/(main)/spaces/new/business/business-quickstart-form.tsx'
    const src = readFileSync(file, 'utf8')
    const kitKinds = new Map([
      ['Input', 'input'],
      ['Textarea', 'textarea'],
    ])
    const blind = auditNames(src, { kitKinds, forwarderProps: new Map() }, file)
    expect(blind.weak.map((w: { line: number }) => w.line)).toEqual([50])

    const seeing = auditNames(src, { kitKinds, forwarderProps: new Map([['Field', 'id']]) }, file)
    expect(seeing.weak).toHaveLength(0)
    expect(seeing.judged).toBe(blind.judged)
  })
})

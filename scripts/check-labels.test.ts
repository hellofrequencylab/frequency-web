import { describe, it, expect } from 'vitest'
import { auditLabels, auditLabelledBy, auditForTargets, fieldLabelNames, stripComments } from './check-labels.mjs'

// The LABEL CONTRACT gate (ADR-966). These are the failure modes it was built to catch and the
// shapes it must NOT cry wolf on. The second half matters as much as the first: this gate scans
// 1,836 files, and a false positive is what earns a gate an allowlist and then an early grave.
//
// The specific near-miss worth keeping: 60 `<Label>` uses in the onboarding illustration renders
// and the on-air stage overlays are a LOCAL component that draws an SVG `<text>`. An SVG caption
// has no control to name, by construction. Counting those would have made the gate 60 false
// positives deep on the day it shipped.

const count = (src: string) => auditLabels(src).violations.length

describe('check:labels — real violations', () => {
  it('flags a <label> sitting BESIDE its control', () => {
    // Renders a <label> pointing at nothing and an <input> with no accessible name. It looks
    // labelled in review and in a screenshot; a screen reader says "edit text, blank".
    expect(count('<div><label className={lbl}>Name</label><Input value={x} /></div>')).toBe(1)
  })

  it('flags the field primitive `<Label>` used the same way', () => {
    const src = "import { Label } from '@/components/ui/field'\n<div><Label>Name</Label><Input /></div>"
    expect(count(src)).toBe(1)
  })

  it('flags a <Label> nested inside a native <label>', () => {
    // Forbidden by the HTML content model. Browsers recover inconsistently, so the symptom
    // depends on the browser rather than on the markup — this shipped in the drafts editor.
    const src = "import { Label } from '@/components/ui/field'\n<label><Label>Title</Label><Input /></label>"
    expect(count(src)).toBe(1)
  })

  it('flags a native <label> nested in another', () => {
    expect(count('<label><label>x</label><input /></label>')).toBe(1)
  })

  it('flags a self-closing <label /> with no htmlFor', () => {
    expect(count('<label className={lbl} />')).toBe(1)
  })

  it('reports the line, so the message is actionable', () => {
    const { violations } = auditLabels('\n\n<div><label>Name</label><Input /></div>')
    expect(violations[0].line).toBe(3)
  })
})

describe('check:labels — shapes that are correct and must stay silent', () => {
  it('passes a <label> that WRAPS its control (implicit association)', () => {
    expect(count('<label className="block"><span className={lbl}>Name</span><Input /></label>')).toBe(0)
  })

  it('passes an explicit htmlFor', () => {
    expect(count('<label htmlFor="x" className={lbl}>Name</label><Input id="x" />')).toBe(0)
  })

  it('passes a heading that is honestly a heading', () => {
    expect(count('<p className={labelClasses}>Name</p><Input />')).toBe(0)
  })

  it('passes a primitive that wraps {children}', () => {
    // components/ui/field.tsx `Field` and components/studio/kit/studio-field.tsx: the control
    // comes from the caller, so it cannot be seen from here.
    expect(count('<label className="block">{children}</label>')).toBe(0)
  })

  it('passes a spread, which may carry htmlFor', () => {
    // Exactly how `Label` in components/ui/field.tsx passes it through. Unknowable is not a
    // violation.
    expect(count('<label className={cn(labelClasses)} {...props} />')).toBe(0)
  })

  it('ignores a LOCAL `Label` that is not the field primitive', () => {
    expect(count('<Label x={1} y={2}>caption</Label>')).toBe(0)
  })

  it('ignores commented-out markup', () => {
    expect(count('{/* <Label>Name</Label> */}')).toBe(0)
  })
})

describe('check:labels — aria-labelledby', () => {
  it('flags a reference with no matching id in the file', () => {
    // The group pattern the gate steers people toward is only correct if the two halves match,
    // and a typo is silent: the element simply has no name again.
    expect(auditLabelledBy('<p id="a">x</p><div aria-labelledby="b" />')).toHaveLength(1)
  })

  it('passes a matched reference', () => {
    expect(auditLabelledBy('<p id="a">x</p><div aria-labelledby="a" />')).toHaveLength(0)
  })

  it('checks every token in a multi-id reference', () => {
    expect(auditLabelledBy('<p id="a">x</p><div aria-labelledby="a b" />')).toHaveLength(1)
  })
})

// Rules 3 + 4 (ADR-1057). Rule 2 accepts the PRESENCE of `htmlFor`, which is shape, not truth —
// a typo'd target renders exactly the label rule 2 was built to catch, and passes. These cover the
// two ways an association can be void while both halves are present, and the shapes that are
// merely UNKNOWABLE, which must stay silent: 306 of the repo's htmlFors are decidable and every
// one of them resolves, so a false positive here is what would earn this rule an allowlist.

const forFails = (src: string) => auditForTargets(src).violations

describe('check:labels — an htmlFor must actually reach a control', () => {
  it('flags an htmlFor whose id exists nowhere in the file', () => {
    expect(forFails('<label htmlFor="event-scop">Where</label><select id="event-scope" />')).toHaveLength(1)
  })

  it('flags an htmlFor pointing at an element that cannot be labelled', () => {
    // Both halves exist and review reads as correct; <div> is not labelable, so the name is void.
    expect(forFails('<label htmlFor="x">Name</label><div id="x"><input /></div>')).toHaveLength(1)
  })

  it('flags a template-literal pair that does not match — the useId() typo', () => {
    expect(forFails('<label htmlFor={`${uid}-nam`}>N</label><input id={`${uid}-name`} />')).toHaveLength(1)
  })

  it('passes a matching template-literal pair', () => {
    expect(forFails('<label htmlFor={`${uid}-name`}>N</label><input id={`${uid}-name`} />')).toHaveLength(0)
  })

  it('passes a matching string pair', () => {
    expect(forFails('<label htmlFor="x">N</label><input id="x" />')).toHaveLength(0)
  })

  it('stays silent on a bare-identifier htmlFor — the target lives in the caller', () => {
    // `connections/new/creator.tsx` and `page-editor/mobile/field-form.tsx` both render
    // `<label htmlFor={htmlFor}>`. Unknowable is not a violation.
    expect(forFails('<label htmlFor={htmlFor}>{label}</label>')).toHaveLength(0)
  })

  it('stays silent when the id sits on a COMPONENT, which may forward it to a control', () => {
    // `template-editor.tsx` does exactly this: <PillarSelect id="primary_pillar" /> renders
    // <Select id={id}>. Judging capitalised carriers would be two false positives on day one.
    expect(forFails('<label htmlFor="p">P</label><PillarSelect id="p" />')).toHaveLength(0)
  })

  it('is not fooled by a > inside an attribute expression', () => {
    const src = '<input id="x" onChange={(e) => set(e)} /><label htmlFor="x">N</label>'
    expect(forFails(src)).toHaveLength(0)
  })

  it('counts what it was able to decide, so a mute parser cannot read as a clean repo', () => {
    expect(auditForTargets('<label htmlFor="x">N</label><input id="x" />').judged).toBe(1)
    expect(auditForTargets('<label htmlFor={htmlFor}>N</label>').judged).toBe(0)
  })
})

describe('check:labels — recognising the field primitive', () => {
  it('accepts a double-quoted import', () => {
    // The original test was hard-single-quoted, so `import { Label } from "…/field"` skipped the
    // whole file: every <Label> in it invisible to every rule. A gate you step around by changing
    // quote style is not a gate.
    expect(fieldLabelNames('import { Label } from "@/components/ui/field"').has('Label')).toBe(true)
  })

  it('follows a renamed import, and judges the local name', () => {
    const src = "import { Label as FieldLabel } from '@/components/ui/field'\n<FieldLabel>Name</FieldLabel><Input />"
    expect(fieldLabelNames(src).has('FieldLabel')).toBe(true)
    expect(auditLabels(src).violations).toHaveLength(1)
  })

  it('does not claim a Label that came from somewhere else', () => {
    expect(fieldLabelNames("import { Label } from './frame'").size).toBe(0)
  })
})

describe('stripComments', () => {
  it('preserves length, so every offset and line number survives', () => {
    const src = 'const a = 1 /* two\nlines */ + 2\n// tail\n'
    expect(stripComments(src)).toHaveLength(src.length)
    expect(stripComments(src).split('\n')).toHaveLength(src.split('\n').length)
  })

  it('does not eat a protocol-relative //', () => {
    expect(stripComments('const u = "https://example.com"')).toContain('https://example.com')
  })
})

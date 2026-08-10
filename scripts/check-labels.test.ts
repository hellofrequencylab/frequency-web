import { describe, it, expect } from 'vitest'
import { auditLabels, auditLabelledBy, stripComments } from './check-labels.mjs'

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

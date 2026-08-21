// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PenLine } from 'lucide-react'
import { SparkDoors } from './spark-doors'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SCREEN ONE HOLDS ITS SHAPE WHILE ONE ENTITY CHANGES ITS AFFORDANCE (ADR-1098).
//
// `veraPrompt` lets Vera's door render as a FIELD instead of a button. The risk in a change like
// that is not the entity asking for it — it is the five entities that did not, and the locked
// structure the file's own comment states: Vera first, build-it-yourself second, extras after,
// every one at equal weight.
//
// So these assertions come in two halves. The PROMPT half proves the new affordance works and puts
// the drop zone where the owner asked for it. The UNCHANGED half is the one that matters in six
// months: it fails if the prompt variant ever leaks into a caller that did not ask for it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

function render(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

const BASE = {
  entityLabel: 'Journey',
  onVera: () => {},
  onManual: () => {},
}

/** The order screen one actually renders, top to bottom, by the text a reader sees. */
function verticalOrder(el: HTMLElement): string[] {
  const out: string[] = []
  for (const node of Array.from(el.querySelectorAll('label, button, a, [data-zone]'))) {
    const text = (node.textContent ?? '').trim()
    if (text) out.push(text)
  }
  return out
}

describe('the standard two-door screen (every entity that has not opted in)', () => {
  it('renders Vera as a BUTTON, first, with the manual door second', () => {
    const el = render(<SparkDoors {...BASE} veraLabel="Have Vera build it" manualLabel="Build it yourself" />)
    const doors = Array.from(el.querySelectorAll('li button')).map((b) => b.textContent ?? '')
    expect(doors[0]).toContain('Have Vera build it')
    expect(doors[1]).toContain('Build it yourself')
  })

  it('renders no textarea, so an entity that did not opt in cannot get a prompt field', () => {
    const el = render(<SparkDoors {...BASE} />)
    expect(el.querySelector('textarea')).toBeNull()
  })

  it('puts the drop zone UNDER both doors, which is where it belongs when it serves both', () => {
    const el = render(
      <SparkDoors {...BASE}>
        <div data-zone>THE ZONE</div>
      </SparkDoors>,
    )
    const order = verticalOrder(el)
    expect(order.indexOf('THE ZONE')).toBeGreaterThan(order.findIndex((t) => t.includes('Build it yourself')))
  })

  it('keeps extra doors after the two standard ones', () => {
    const el = render(
      <SparkDoors {...BASE} extraDoors={[{ key: 'x', label: 'Start with a template', hint: 'h', Icon: PenLine }]} />,
    )
    const doors = Array.from(el.querySelectorAll('li button')).map((b) => b.textContent ?? '')
    expect(doors).toHaveLength(3)
    expect(doors[2]).toContain('Start with a template')
  })
})

describe('the prompt variant', () => {
  const PROMPT = {
    label: 'Tell me about your Journey',
    value: '',
    onChange: () => {},
  }

  it('renders Vera as a labelled FIELD, not a door card', () => {
    const el = render(<SparkDoors {...BASE} veraPrompt={PROMPT} />)
    const area = el.querySelector('textarea')
    expect(area).not.toBeNull()
    const label = el.querySelector(`label[for="${area!.id}"]`)
    expect(label?.textContent).toContain('Tell me about your Journey')
  })

  it('drops the Vera door card, so the same door is never offered twice', () => {
    const el = render(<SparkDoors {...BASE} veraPrompt={PROMPT} veraLabel="Have Vera build it" />)
    const doors = Array.from(el.querySelectorAll('li button')).map((b) => b.textContent ?? '')
    expect(doors.some((d) => d.includes('Have Vera build it'))).toBe(false)
  })

  it('🔴 moves the drop zone ABOVE the remaining doors — the owner-specified order', () => {
    const el = render(
      <SparkDoors {...BASE} veraPrompt={PROMPT} manualLabel="Build it yourself">
        <div data-zone>THE ZONE</div>
      </SparkDoors>,
    )
    const order = verticalOrder(el)
    const prompt = order.findIndex((t) => t.includes('Tell me about your Journey'))
    const zone = order.indexOf('THE ZONE')
    const manual = order.findIndex((t) => t.includes('Build it yourself'))
    expect(prompt).toBeGreaterThanOrEqual(0)
    expect(zone).toBeGreaterThan(prompt)
    expect(manual).toBeGreaterThan(zone)
  })

  it('renders the zone exactly once — not in both positions', () => {
    const el = render(
      <SparkDoors {...BASE} veraPrompt={PROMPT}>
        <div data-zone>THE ZONE</div>
      </SparkDoors>,
    )
    expect(el.querySelectorAll('[data-zone]')).toHaveLength(1)
  })

  it('disables submit while the field is empty, because that button could only fail', () => {
    const el = render(<SparkDoors {...BASE} veraPrompt={PROMPT} />)
    const submit = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Draft it with Vera'))
    expect(submit).toBeDefined()
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables submit once there is something to read', () => {
    const el = render(<SparkDoors {...BASE} veraPrompt={{ ...PROMPT, value: 'a six week reset' }} />)
    const submit = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Draft it with Vera'))
    expect((submit as HTMLButtonElement).disabled).toBe(false)
  })

  it('still puts the manual door before the extras, so the lock still holds', () => {
    const el = render(
      <SparkDoors
        {...BASE}
        veraPrompt={PROMPT}
        manualLabel="Build it yourself"
        extraDoors={[{ key: 'x', label: 'Start with a template', hint: 'h', Icon: PenLine }]}
      />,
    )
    const doors = Array.from(el.querySelectorAll('li button')).map((b) => b.textContent ?? '')
    expect(doors).toHaveLength(2)
    expect(doors[0]).toContain('Build it yourself')
    expect(doors[1]).toContain('Start with a template')
  })
})

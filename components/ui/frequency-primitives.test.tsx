// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// THE SHARED PRIMITIVES UNDER FREQUENCY (ADR-1737). A Frequency build renders every primitive in the
// members kit's own markup (design_handoff/frequency/templates/members/app/app.css; the extra states in
// app/themes/frequency/members-ui.css), so a member route whose body was never rebuilt still wears the
// design. The DAWN tests beside this file prove DAWN's strings did not move; these prove the other half.
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/codes' }))

const { Button, buttonClasses, buttonGeometry } = await import('./button')
const { Badge, badgeClasses } = await import('./badge')
const { UnderlineTabs } = await import('./underline-tabs')
const { Field, Input, Textarea, fieldClasses, labelClasses } = await import('./field')
const { Select } = await import('./select')
const { Switch } = await import('./switch')
const { EmptyState } = await import('./empty-state')
const { StatCard } = await import('./stat-card')
const { Meter } = await import('./meter')
const { ProgressTrack } = await import('./progress-track')
const { Avatar } = await import('./avatar')

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>)
const doc = (node: React.ReactNode) => {
  const host = document.createElement('div')
  host.innerHTML = html(node)
  return host
}

describe('Button is the kit .btn', () => {
  it('maps every variant and size onto the kit classes, with no DAWN token left', () => {
    expect(buttonClasses('primary')).toBe('btn pa')
    expect(buttonClasses('secondary', 'sm')).toBe('btn sm')
    expect(buttonClasses('ghost', 'lg')).toBe('btn txt lg')
    expect(buttonClasses('danger', 'xs', 'w-full')).toBe('btn mu-danger xs w-full')
    expect(buttonGeometry('md')).toBe('btn')
    for (const v of ['primary', 'primarySoft', 'secondary', 'ghost', 'danger', 'warning', 'dangerOutline'] as const) {
      expect(buttonClasses(v)).not.toMatch(/rounded-control|bg-primary|lift-1/)
    }
  })
  it('keeps the loading contract on the kit button', () => {
    const b = doc(<Button loading>Save</Button>).querySelector('button')!
    expect(b.className).toBe('btn pa')
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
  })
})

describe('Badge is the kit .tag', () => {
  it('tones by meaning and keeps the neutral tag bare', () => {
    expect(badgeClasses()).toBe('tag')
    expect(badgeClasses('broadcast', 'sm', { solid: true })).toBe('tag mu-broadcast mu-solid mu-sm')
    expect(html(<Badge tone="success">Paid</Badge>)).toBe('<span class="tag mu-success">Paid</span>')
  })
})

describe('UnderlineTabs is the kit .tabs strip', () => {
  it('marks the active tab .on and carries counts as mu-count', () => {
    const nav = doc(<UnderlineTabs tabs={[{ href: '/codes', label: 'Codes', count: 3 }, { href: '/codes/new', label: 'New' }]} />).querySelector('nav')!
    expect(nav.className).toBe('tabs')
    const [on, off] = Array.from(nav.querySelectorAll('a'))
    expect(on.className).toBe('on')
    expect(on.getAttribute('aria-current')).toBe('page')
    expect(on.querySelector('.mu-count')?.textContent).toBe('3')
    expect(off.className).toBe('')
  })
})

describe('Field, Input, Select and Switch are the kit form controls', () => {
  it('renders the .field column, the .input well and the label voice', () => {
    expect(fieldClasses).toBe('input')
    expect(labelClasses).toBe('mu-label')
    const label = doc(
      <Field label="Name" hint="As it should read">
        <Input name="n" />
      </Field>,
    ).querySelector('label')!
    expect(label.className).toBe('field')
    expect(label.querySelector('.mu-label')?.textContent).toBe('Name')
    expect(label.querySelector('input')?.className).toBe('input')
    expect(label.querySelector('.mu-hint')?.textContent).toBe('As it should read')
    expect(doc(<Textarea />).querySelector('textarea')?.className).toBe('input')
  })
  it('swaps the hint for the error', () => {
    const label = doc(<Field label="Name" error="Required"><Input /></Field>).querySelector('label')!
    expect(label.querySelector('.mu-hint')).toBeNull()
    expect(label.querySelector('.mu-err')?.textContent).toBe('Required')
  })
  it('wraps a select in the chevron frame and tints the active one', () => {
    const wrap = doc(<Select options={['A']} tone="active" />).firstElementChild!
    expect(wrap.className).toBe('mu-select')
    expect(wrap.querySelector('select')?.className).toBe('input mu-active')
  })
  it('draws the switch as the kit .sw', () => {
    const on = doc(<Switch checked onCheckedChange={() => {}} aria-label="Reminders" />).querySelector('button')!
    expect(on.className).toBe('sw on')
    expect(on.getAttribute('role')).toBe('switch')
    expect(on.children.length).toBe(0)
    expect(doc(<Switch checked={false} pending onCheckedChange={() => {}} />).querySelector('button')?.className).toBe('sw mu-pending')
  })
})

describe('EmptyState, StatCard, Meter, ProgressTrack, Avatar', () => {
  it('renders the empty state as the kit .empty with the .ic chip and .h3 title', () => {
    const e = doc(<EmptyState title="No codes yet" description="Make one." variant="error" />).firstElementChild!
    expect(e.className).toBe('empty mu-empty')
    expect(e.getAttribute('data-tone')).toBe('error')
    expect(e.querySelector('.ic svg')).toBeTruthy()
    expect(e.querySelector('.h3')?.textContent).toBe('No codes yet')
    expect(e.querySelector('.t2')?.textContent).toBe('Make one.')
  })
  it('renders a stat as a .panel with the .k label over the .num reading', () => {
    const s = doc(<StatCard label="Scans" value={42} detail="this week" href="/codes" size="sm" />).firstElementChild!
    expect(s.tagName).toBe('A')
    expect(s.className).toBe('panel mu-stat mu-sm')
    expect(s.querySelector('.k')?.textContent).toBe('Scans')
    expect(s.querySelector('.num')?.textContent).toBe('42')
    expect(s.querySelector('.t2')?.textContent).toBe('this week')
  })
  it('renders both bars as the kit .meter, keeping the cap law and the progressbar role', () => {
    const m = doc(<Meter used={9} cap={10} label="Codes" />)
    expect(m.querySelector('.meter')?.className).toBe('meter block mu-warning')
    expect(m.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('9')
    const p = doc(<ProgressTrack value={30} size="lg" tone="success" />).firstElementChild as HTMLElement
    expect(p.className).toBe('meter mu-h8 mu-success')
    expect((p.querySelector('i') as HTMLElement).style.width).toBe('30%')
  })
  it('gives an avatar the kit .av ring and ink initials', () => {
    const a = doc(<Avatar src={null} name="Ana Lee" />).firstElementChild!
    expect(a.className).toContain('av ')
    expect(a.className).not.toContain('bg-primary-bg')
    expect(a.textContent).toBe('AL')
  })
})

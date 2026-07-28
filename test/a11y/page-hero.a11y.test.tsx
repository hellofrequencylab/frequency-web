// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { findA11yViolations, formatViolations } from './axe'
import { PageHero, HERO_ACTION_CLASS_ADAPTIVE } from '@/components/templates/page-hero'

// The identity hero is the one header a member meets first (their own profile, a Circle, a
// Journey), and the mobile pass of 2026-07-28 changed how its on-cover control cluster lays out on
// a phone — the cluster used to render at max-content width and get painted off the page by the
// section's `overflow-hidden`, so several controls existed in the DOM and could not be reached.
//
// That failure is a LAYOUT failure, which jsdom cannot see (no layout, no paint — see axe.ts). What
// this file guards is the half axe CAN judge from the DOM alone, and it is the half that makes the
// layout fix worth having: the cluster is announced as a named group rather than a loose run of
// buttons, every control in it carries an accessible name, and the band still exposes exactly one
// heading for the entity. A future "make the phone chips icon-only" edit is exactly the change that
// would silently strip those names, which is why the icon-only case is asserted too.

const chip = (label: string) => (
  <a href={`/${label}`} className={HERO_ACTION_CLASS_ADAPTIVE}>
    {label}
  </a>
)

const cases: Array<{ name: string; ui: React.ReactElement }> = [
  {
    name: 'identity hero, adaptive, full viewer action set',
    ui: (
      <PageHero
        variant="identity"
        size="standard"
        coverImage={null}
        adaptiveText
        actionsLabel="Profile actions"
        leading={<span />}
        eyebrow={<span>MEMBER</span>}
        title="Ada Lovelace"
        subtitle={<span>@ada</span>}
        actions={<>{chip('Save contact')}{chip('Message')}{chip('Tip')}</>}
      />
    ),
  },
  {
    name: 'identity hero, icon-only chip keeps its name via sr-only text',
    ui: (
      <PageHero
        variant="identity"
        coverImage={null}
        adaptiveText
        actionsLabel="Profile actions"
        title="Ada Lovelace"
        actions={
          <button type="button" className={HERO_ACTION_CLASS_ADAPTIVE}>
            <span aria-hidden>★</span>
            <span className="sr-only">Save contact</span>
          </button>
        }
      />
    ),
  },
  {
    name: 'identity hero, no actions at all (a stranger, signed out)',
    ui: <PageHero variant="identity" coverImage={null} adaptiveText title="Ada Lovelace" subtitle={<span>@ada</span>} />,
  },
]

describe('PageHero identity — a11y (axe)', () => {
  for (const c of cases) {
    it(`${c.name} has no axe violations`, async () => {
      const violations = await findA11yViolations(c.ui)
      expect(violations, `\n${formatViolations(violations)}\n`).toEqual([])
    })
  }

  it('names the on-cover cluster so it is not an unlabelled run of controls', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const html = renderToStaticMarkup(cases[0].ui)
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Profile actions"')
  })
})

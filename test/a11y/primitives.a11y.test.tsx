// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Search } from 'lucide-react'
import { findA11yViolations, formatViolations } from './axe'

import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { DemoBadge } from '@/components/ui/demo-badge'
import { EntityCard } from '@/components/cards/entity-card'
import { PersonCard } from '@/components/cards/person-card'
import { Button } from '@/components/marketing/marketing-ui'

// A11y regression gate for the shared design-system primitives (meta-scan A+). Every browse
// page, dashboard, and marketing surface composes these, so asserting they are axe-clean makes
// accessibility structural rather than per-page hope. See test/a11y/axe.ts for what jsdom+axe
// can and cannot check (structure yes; colour-contrast is a separate manual/visual concern).
//
// A case is a real render with representative props (including the interactive variants — a
// linked SectionHeader, an EntityCard whose whole body is an anchor), so the accessible-name
// and role checks run against the shape pages actually ship.

const cases: Array<{ name: string; ui: React.ReactElement }> = [
  { name: 'EmptyState (no-results)', ui: <EmptyState icon={Search} title={'No people matching "ada"'} description="Try a different name or handle." variant="no-results" /> },
  { name: 'EmptyState (first-use + action)', ui: <EmptyState title="No circles yet" description="Start one to gather your people." action={<Button href="/circles/new">Start a Circle</Button>} /> },
  { name: 'SectionHeader (plain)', ui: <SectionHeader title="Your timeline" /> },
  { name: 'SectionHeader (linked + count)', ui: <SectionHeader title="Your circles" count={3} href="/circles" /> },
  { name: 'StatCard', ui: <StatCard label="Members" value={128} detail="across 12 circles" /> },
  { name: 'StatCard (linked)', ui: <StatCard label="Zaps" value="1,234" href="/crew" bordered /> },
  { name: 'DemoBadge', ui: <DemoBadge /> },
  { name: 'EntityCard', ui: <EntityCard href="/circles/ada" title="Sunday Runners" context="Portland · 24 members" description="A calm weekly jog." /> },
  { name: 'PersonCard', ui: <PersonCard handle="ada" displayName="Ada Lovelace" context="@ada" /> },
  { name: 'Button (marketing)', ui: <Button href="/onboarding/beta">Join the beta</Button> },
]

describe('design-system primitives — a11y (axe)', () => {
  for (const c of cases) {
    it(`${c.name} has no axe violations`, async () => {
      const violations = await findA11yViolations(c.ui)
      expect(violations, `\n${formatViolations(violations)}\n`).toEqual([])
    })
  }
})

// Self-test: prove the harness actually runs axe and catches structural violations — otherwise a
// silently no-op'd harness (bad import, empty render, disabled everything) would make every real
// test pass vacuously. A label-less input is a canonical WCAG failure axe detects from the DOM alone.
describe('a11y harness — self-test (guards against a vacuous pass)', () => {
  it('flags a form control with no accessible label', async () => {
    const violations = await findA11yViolations(<input type="text" name="unlabelled" />)
    expect(violations.map((v) => v.id)).toContain('label')
  })
})

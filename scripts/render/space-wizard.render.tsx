// FIXTURE RENDER: the Space Creation Wizard at one step, written to $RENDER_OUT/space-wizard-<step>.html.
// RENDER_STEP is 0..3. See contacts.render.tsx for the run steps. The wizard's first nine useState
// calls are its own (see the order below), so the mock seeds those and leaves every other hook alone.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

const H = vi.hoisted(() => ({ step: Number(process.env.RENDER_STEP ?? 0), plan: process.env.RENDER_PLAN ?? 'business', calls: 0 }))
const { step, plan } = H
vi.mock('react', async (orig) => {
  const real = (await orig()) as typeof import('react')
    return {
    ...real,
    default: real,
    useState: (init: unknown) => {
      H.calls += 1
      const calls = H.calls
      // order: intents, choiceId, choiceTouched, name, slug, slugTouched, visibility, heardAbout, step
      if (calls === 9) return [H.step, () => {}]
      if (calls === 1) return [['bookings', 'events'], () => {}]
      if (calls === 4 && H.step >= 2) return ['River Yoga', () => {}]
      if (calls === 5 && H.step >= 2) return ['river-yoga', () => {}]
      return real.useState(init as never)
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/new', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('@/lib/spaces/provision', () => ({ createSpace: async () => ({}) }))

const out = process.env.RENDER_OUT

it('renders the space wizard', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { CreateSpaceWizard } = await import('@/app/(main)/spaces/new/create-space-wizard')
  const { listModeChoices } = await import('@/lib/spaces/modes')
  const { setupPresetForMode } = await import('@/lib/pricing/bundles')
  const choices = listModeChoices()
  const presetLabels: Record<string, string | null> = {}
  for (const c of choices) presetLabels[c.id] = setupPresetForMode(c.type as never, c.variant)?.label ?? null
  const el = createElement(CreateSpaceWizard, { choices, initialPlan: plan as never, presetLabels, heardAboutOptions: ['A friend', 'Instagram'] } as never)
  const { prelude } = await prerenderToNodeStream(el)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  writeFileSync(`${out}/space-wizard-${step}.html`,
    `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" class="fq-members" style="max-width:720px;margin:0 auto;padding:16px">${Buffer.concat(chunks).toString()}</div></body></html>`)
})

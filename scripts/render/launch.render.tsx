// FIXTURE RENDER: the Owner Launch screens, written to $RENDER_OUT/launch-<screen>.html. Screens: q1 (the name),
// q2 (a long answer with the example chip), mood, working, preview. Run like space-wizard.render.tsx. The
// question screens go through the real SparkShell with a mocked useState for the step; the working and preview
// screens are the presentational components rendered directly.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/launch', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('@/app/(main)/spaces/launch/actions', () => ({ startLaunch: async () => ({}), launchStatus: async () => ({}), launchSpace: async () => ({}) }))

const out = process.env.RENDER_OUT

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" class="fq-members" style="max-width:720px;margin:0 auto;padding:16px">${Buffer.concat(chunks).toString()}</div></body></html>`
}

it('renders the launch screens', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SparkShell } = await import('@/components/studio/spark')
  const { LAUNCH_QUESTIONS } = await import('@/lib/importer/launch')
  const S = await import('@/app/(main)/spaces/launch/launch-screens')
  const question = (i: number, value: string) => {
    const q = LAUNCH_QUESTIONS[i]
    return createElement(
      S.LaunchBackdrop,
      null,
      createElement(
        SparkShell,
        { eyebrow: 'Launch your page', headingLevel: 2, title: S.lockup(q.title), description: q.help, step: i + 1, totalSteps: LAUNCH_QUESTIONS.length, onBack: i > 0 ? () => {} : undefined, onNext: () => {}, nextLabel: value ? 'Continue' : 'Skip', draftScopeKey: null } as never,
        createElement(S.LaunchField, { question: q, value, onChange: () => {} }),
      ),
    )
  }
  writeFileSync(`${out}/launch-q1.html`, await html(question(0, 'River Yoga')))
  writeFileSync(`${out}/launch-q2.html`, await html(question(2, '')))
  writeFileSync(`${out}/launch-mood.html`, await html(question(7, 'calm')))
  writeFileSync(`${out}/launch-working.html`, await html(createElement(S.LaunchBackdrop as never, { orb: false } as never, createElement(S.LaunchWorking, { name: 'River Yoga' }))))
  writeFileSync(
    `${out}/launch-preview.html`,
    await html(
      createElement(S.LaunchBackdrop, null, createElement(S.LaunchPreview, {
        preview: {
          name: 'River Yoga',
          tagline: 'Small classes, a river view, and a hello by name.',
          about: 'River Yoga is a small studio in Encinitas where every class tops out at eight people. Joanna has taught for twelve years and never rushes anyone.',
          offerings: [{ title: 'Drop-in class', price: 20 }, { title: 'Monthly membership', price: 120 }, { title: 'Private session', price: 90 }],
          faqCount: 5,
        },
        busy: false,
        error: null,
        onLaunch: () => {},
        onBack: () => {},
      })),
    ),
  )
})

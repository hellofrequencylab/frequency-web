// FIXTURE RENDER: the Frequency Settings pane switcher with fixture panes, to $RENDER_OUT/settings.html.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const out = process.env.RENDER_OUT
const pane = (key: string, label: string, text: string) => ({ key, label, anchors: [], content: createElement('p', { className: 'body' }, text) })

it('renders the settings panes', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SettingsPanes } = await import('@/components/frequency/members/settings/settings-panes')
  const panes = [pane('account', 'Account', 'Your name, email and password.'), pane('privacy', 'Privacy', 'Who can see you.'), pane('billing', 'Plan', 'Your membership.')]
  const { prelude } = await prerenderToNodeStream(createElement(SettingsPanes, { panes, initial: 'account' }))
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  writeFileSync(`${out}/settings.html`,
    `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" data-energy="still"><div class="fqm-body">${Buffer.concat(chunks).toString()}</div></div></body></html>`)
})

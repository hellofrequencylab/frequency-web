// FIXTURE RENDER: the Free Human booking form on a hosted site, which loads the kit CSS and NOT the Frequency app CSS (the
// Select primitive's chevron has no size there). Writes $RENDER_OUT/fh-booking.html.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-booking-form.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'

const out = process.env.RENDER_OUT

it('renders the Free Human booking form', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FreeHumanBookingForm } = await import('@/components/sites/free-human-booking-form')
  const { FREE_HUMAN_CSS } = await import('@/components/sites/free-human-css')
  const { HOUSE_CSS } = await import('@/components/sites/house-css')
  const form = renderToStaticMarkup(h(FreeHumanBookingForm, { slug: null, kinds: ['Retreat', 'Conference', 'School', 'Podcast'], submitLabel: 'Request a booking', note: 'We write back to every request.', successMessage: 'Thanks' }))
  writeFileSync(`${out}/fh-booking.html`, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${HOUSE_CSS}${FREE_HUMAN_CSS}body{margin:0;background:#f7ecdc}</style><div data-house-theme="free-human" data-season="fall" style="padding:24px;max-width:760px">${form}</div>`)
})

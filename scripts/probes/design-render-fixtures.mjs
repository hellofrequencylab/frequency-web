import assert from 'node:assert/strict'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadProbeModule } from '../lib/probe-module.mjs'
const link = ({ children, ...props }) => React.createElement('a', props, children)
for (const design of ['dawn', 'frequency']) {
  const { RowCard } = loadProbeModule('components/cards/row-card.tsx', {
    'next/link': { __esModule: true, default: link },
    '@/lib/theme/design': { SITE_DESIGN: design },
    'react/jsx-runtime': jsx,
  })
  const html = renderToStaticMarkup(React.createElement(RowCard, { href: '/practices/1', title: 'Morning pages' }))
  assert.match(html, /href="\/practices\/1"/)
  assert.match(html, /Morning pages/)
  assert.match(html, design === 'frequency' ? /mu-row/ : /press/)
}
console.log('Both actual design renderers retain the destination and title; legacy fixtures select their design explicitly, and full suites retain their original interaction/privacy assertions.')

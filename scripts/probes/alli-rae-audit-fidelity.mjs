#!/usr/bin/env node
// LIVE-1497: the Alli Rae audit (2026-10-27) found the Designer build short of the design system in the buttons, the
// arch frame, the project cards, the numbered steps, the FAQ motion, the form, the phone header, the footer join and
// the firm's own words (typos kept, the menu's titles and lines). Fails when one of those details leaves the tree.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const need = (file, needles) => {
  const s = r(file)
  for (const n of needles) if (!s.includes(n)) bad.push(`${file} lost ${n}`)
}
if (!existsSync('components/sites/designer-faq-list.tsx')) bad.push('the FAQ list island is missing')
else need('components/sites/designer-faq-list.tsx', ['dz-faq-panel', 'aria-expanded'])
need('components/sites/designer-blocks-css.ts', ['.dz-btn-warm', 'translate(18px,-18px)', 'grid-template-rows:0fr', '.dz-done-mark', '.dz-form::before', 'padding:21px 38px', '.dz-btn-link'])
need('components/sites/designer-css.ts', ['.mw-page{padding-bottom:0}', 'a[data-cta]'])
need('components/sites/house-menu.tsx', ['data-cta'])
need('lib/theme/designer.ts', ['--dz-size-h3', '--dz-scrim-hero-page', '--dz-shadow-slab-band'])
need('lib/sites/alli-rae-site.ts', ['Design-First-Thinking', 'Kindy fill out', 'your in the process', 'have have', 'MENU_PROJECTS', 'ADDRESS_UNIT'])
need('scripts/seed-alli-rae-update-2.mts', ['zz_backup_alli_rae_update2_20261027', 'ALLI_RAE_SLUG'])

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae audit fidelity details are in place.')

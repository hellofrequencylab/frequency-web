#!/usr/bin/env node
// LIVE-1368: a Mega Theme that owns a ground hands email, the Space page and the event page one surface.
//
// Fails when the surface registry loses Midnight, when email stops reading it, when the Space layouts or the
// event page stop passing it to AccentScope, or when AccentScope stops painting it.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
if (!/midnight:\s*MIDNIGHT_SURFACE/.test(r('lib/theme/surface.ts'))) bad.push('the surface registry has no Midnight entry')
if (!r('lib/spaces/email-colors.ts').includes('emailSurface(')) bad.push('Space email no longer reads the theme surface')
for (const f of ['app/(main)/spaces/[slug]/layout.tsx', 'app/(public)/spaces/[slug]/layout.tsx']) if (!r(f).includes('surface={pageSurface(')) bad.push(`${f} does not pass the surface to AccentScope`)
if (!r('app/(public)/events/[slug]/page.tsx').includes('surface={surface}')) bad.push('the public event page does not wear its host Space surface')
if (!r('app/(main)/events/[slug]/event-member-page.tsx').includes('surface={hostSurface}')) bad.push('the event page does not wear its host Space surface')
if (!r('components/spaces/accent-scope.tsx').includes('surfaceCssVars(surface)')) bad.push('AccentScope does not paint the surface')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('theme surface: ok')

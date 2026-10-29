#!/usr/bin/env node
// LIVE-1913: the launch opens as a full-screen lightbox, and /spaces/new is one front door.
//
// Fails when the launch layout stops wrapping its pages in the lightbox (the shared Dialog at align="overlay", with
// Pause as the close), or when /spaces/new lets a person with no launch under way fall through to the old form while
// the launch is on instead of starting one.
import { readFileSync } from 'node:fs'

const bad = []
const layout = readFileSync('app/(main)/launch/layout.tsx', 'utf8')
if (!layout.includes('LaunchLightbox')) bad.push('app/(main)/launch/layout.tsx no longer wraps the launch in LaunchLightbox')

const box = readFileSync('components/launch/launch-lightbox.tsx', 'utf8')
if (!/align="overlay"/.test(box)) bad.push('the lightbox is no longer the shared Dialog at align="overlay"')
if (!/Pause/.test(box)) bad.push('the lightbox lost its Pause close')

const page = readFileSync('app/(main)/spaces/new/page.tsx', 'utf8')
if (!page.includes("'/launch/start'")) bad.push('/spaces/new no longer starts the launch for someone with none under way')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('launch lightbox: ok')

#!/usr/bin/env node
// LIVE-1264 probe: the console's boot scene starts with the board's. A fixed 1 s wait after the port opened ran
// about half a second ahead of the CYD (owner, 2026-10-21); the page now starts on the line the board prints just
// before its own scene, with a fallback for firmware that never prints it. Fails on main before LIVE-1264.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/const BOOT_SCENE_LINE = \/stage=before-wifi-init\//.test(c)) bad.push("the console no longer watches for the board's scene line")
if (!/BOOT_SCENE_LINE\.test\(l\.text\)\) setBoardSceneAt\(/.test(c)) bad.push('the scene line no longer marks when the board began')
if (!/finale && boardSceneAt !== null\) beginRef\.current\?\.\(\)/.test(c)) bad.push("the page's scene no longer starts on the board's")
if (!/setTimeout\(begin, BOOT_SYNC_FALLBACK_MS\)/.test(c)) bad.push('a board that never prints the line leaves the page blank')
if (bad.length) { console.error('LIVE-1264 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log("LIVE-1264: the console's boot scene starts with the board's")

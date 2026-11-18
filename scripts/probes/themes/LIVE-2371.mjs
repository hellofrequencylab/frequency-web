#!/usr/bin/env node
// LIVE-2371 probe: the Honey template and its chrome name no real person or book, the one Space that owns those words keeps them,
// and its seed reads its own file, not the template.
import { readFileSync } from 'node:fs'
const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8')
const fail = (m) => { console.error(`LIVE-2371: ${m}`); process.exit(1) }
const NAMES = /Audrey|Wilder|Beyond \*?The Wild|Defying \*?Men/
const home = read('lib/sites/free-human-home.ts').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
if (NAMES.test(home)) fail('the Honey template names a real person or book')
if (!/title: 'Say what you help people/.test(home)) fail('the Honey hero does not coach')
const chrome = read('lib/sites/free-human-chrome.ts')
const generic = chrome.slice(chrome.indexOf('export const FREE_HUMAN_PANELS'), chrome.indexOf('const FREE_HUMAN_MOVEMENT_PANELS'))
if (!generic || NAMES.test(generic)) fail('the Honey header menus name a real person or book')
if (!/for \(const p of own \? FREE_HUMAN_MOVEMENT_PANELS : FREE_HUMAN_PANELS\)/.test(chrome)) fail('the Free Human Movement Space lost its own menus')
if (!/from '@\/lib\/sites\/free-human-movement-home'/.test(read('lib/sites/free-human-site.ts'))) fail('the Free Human Movement seed reads the template')
console.log('LIVE-2371: Honey templates coach; Free Human Movement keeps its own words')

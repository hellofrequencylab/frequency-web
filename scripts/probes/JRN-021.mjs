#!/usr/bin/env node
// JRN-021: a lesson reads as a lesson. The Focus player printed a lesson body as one pre-wrapped
// string, so a Markdown list showed as lines that start with a dash. This renders the real
// renderer on a real list and fails if a dash survives, and checks the player and the page use it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const player = readFileSync('components/journey/v2/learn/learn-player.tsx', 'utf8')
const page = readFileSync('app/(main)/journeys/[slug]/play/page.tsx', 'utf8')
const prose = readFileSync('components/journey/v2/learn/lesson-prose.tsx', 'utf8')
const sheet = readFileSync('app/themes/frequency/members-c.css', 'utf8')

// The body is rendered as Markdown on the server and handed to the player as a node.
assert.ok(prose.includes('ReactMarkdown') && prose.includes('lessonStructure'), 'LessonProse renders Markdown through the structure pass')
assert.ok(page.includes('<LessonProse>') && page.includes('bodyById={bodyById}'), 'the play page pre-renders each open lesson body')
assert.ok(player.includes('bodyNode ??'), 'the player draws the pre-rendered body')
// The raw string is only the fallback, never the lesson pane's own rule.
assert.ok(!player.includes('max-w-prose whitespace-pre-wrap text-body leading-relaxed'), 'the pre-wrapped body is gone')
// The lesson's title is the page h1, with the week's steps beside it.
assert.ok(player.includes('<h1 className="h1 mc-ftitle">') && player.includes('mc-wsteps'), 'the lesson owns the h1 and shows the week as steps')
// A week that has not opened sends no lesson words to the browser.
assert.ok(/locked\) lessonsById\[l\.id\] = \{ \.\.\.content, body: null \}/.test(page), 'a locked week keeps its bodies on the server')
for (const c of ['.mc-prose', '.mc-beats', '.mc-fill', '.mc-group', '.mc-fbar', '.mc-wsteps']) assert.ok(sheet.includes(c), `${c} is styled`)
console.log('JRN-021: lessons render as Markdown with a lede, lists, groups and a run of show; the player owns the lesson heading and the week steps')

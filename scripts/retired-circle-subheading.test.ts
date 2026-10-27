import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { retiredCircleSubheading } from './probes/retired-circle-subheading.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
it('holds actual active Circle content and surviving engagement contracts', () => expect(retiredCircleSubheading()).toBe(true))
it('rejects restoring the unused helper', () => expect(() => retiredCircleSubheading({ exists: p => p === 'lib/circles/subheading.ts' || existsSync(p) })).toThrow())
it.each([
  ['app/(main)/circles/[slug]/(circle)/layout.tsx', 'subline={[', 'oldSubline={['],
  ['app/(main)/circles/[slug]/(circle)/layout.tsx', 'about={circle.about}', 'about={null}'],
  ['app/(main)/circles/[slug]/(circle)/layout.tsx', '<FqCircleSpaceHeader spaceSlug={owner}', '<div data-owner={owner}'],
  ['components/frequency/members/circle/circle-shell.tsx', '{subline && <span', '{false && <span'],
  ['components/frequency/members/circle/circle-shell.tsx', 'richParagraphs(about)', 'about'],
  ['components/frequency/members/circle/circle-shell.tsx', 'inSpace ? <h2', 'inSpace ? <h1'],
  ['components/widgets/circles/circle-feed.tsx', 'just joined', 'unused greeting'],
])('rejects losing actual surviving behavior in %s', (file, original, changed) => {
  expect(read(file)).toContain(original)
  expect(() => retiredCircleSubheading({ read: p => p === file ? read(p).replaceAll(original, changed) : read(p) })).toThrow()
})

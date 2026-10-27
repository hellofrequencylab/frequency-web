import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
const uncomment = s => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
export function retiredCircleSubheading({ exists = existsSync, read = p => readFileSync(p, 'utf8') } = {}) {
  assert.equal(exists('lib/circles/subheading.ts'), false, 'retired header-only helper returned')
  const layout = uncomment(read('app/(main)/circles/[slug]/(circle)/layout.tsx'))
  assert.match(layout, /<FqCircleShell/, 'active Frequency Circle shell lost')
  assert.match(layout, /subline=\{\[\s*`\$\{circle\.member_count\}/, 'actual member metadata subline lost')
  assert.match(layout, /^\s+about=\{circle\.about\}/m, 'human About content lost')
  assert.match(layout, /<FqCircleSpaceHeader spaceSlug=\{owner\}/, 'owning Space context lost')
  assert.doesNotMatch(layout, /primary === 'post'/, 'Post cannot replace the primary Create menu')
  assert.match(layout, /<CircleCreateMenu/, 'Create entry lost')
  assert.match(layout, /<CircleMemberMenu/, 'member overflow entry lost')
  const shell = uncomment(read('components/frequency/members/circle/circle-shell.tsx'))
  assert.match(shell, /\{subline && <span className="fqm-cl-sub">\{subline\}<\/span>\}/, 'active shell no longer renders its subline')
  assert.match(shell, /<div className="body fqm-about stack">\{richParagraphs\(about\)\}<\/div>/, 'active shell no longer safely formats human About text')
  assert.doesNotMatch(shell, /dangerouslySetInnerHTML/, 'raw HTML must not replace the safe parser')
  assert.match(shell, /inSpace \? <h2 className="h1">/, 'owning Space keeps its single primary heading')
  // Preserve the surviving LIVE-385 content/engagement retirement contract.
  assert.match(read('components/circles/circle-create-menu.tsx'), /New post/, 'posting door lost')
  assert.equal(exists('lib/circles/circle-text.ts'), false, 'retired page-text storage returned')
  assert.equal(exists('components/widgets/circles/circle-text.tsx'), false, 'retired page-text widget returned')
  assert.doesNotMatch(read('lib/widgets/modules.ts'), /\{ id: 'circle-text'/, 'retired page-text catalog returned')
  assert.doesNotMatch(read('lib/admin/modules/registry.ts'), /id: 'circle\.text'/, 'retired page-text editor returned')
  assert.match(read('lib/circles/arrivals.ts'), /export function newArrivals/, 'new-arrival rule lost')
  assert.match(read('components/widgets/circles/circle-feed.tsx'), /newArrivals/, 'new arrivals no longer consumed')
  assert.match(read('components/widgets/circles/circle-feed.tsx'), /just joined/, 'greeting strip lost')
  return true
}
if (invokedDirectly(import.meta.url)) {
  retiredCircleSubheading()
  console.log('Unused legacy subheading helper retired; active Frequency metadata, About, Space context and engagement retained')
}

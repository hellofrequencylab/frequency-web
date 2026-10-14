// LIVE-919 (ADR-1748): the Space site theme and its font set read "Default", not "Frequency", wherever an
// owner picks them, so "Frequency" is free to name the platform's design system. The stored id stays.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (f) => readFileSync(f, 'utf8')
assert.match(read('lib/theme/site-style.ts'), /id: 'frequency',\s*label: 'Default'/, 'site theme label')
assert.match(read('lib/theme/space-themes.ts'), /id: 'frequency',\s*label: 'Default'/, 'font set label')
assert.match(read('components/sites/editor/shell.tsx'), /DAWN: 'Default'/, 'website editor label')
assert.doesNotMatch(read('content/help/spaces/your-website.md'), /\*\*Frequency\*\* \(the default\)|pick \*\*Frequency\*\* or/, 'help article')
console.log('The default Space site theme reads "Default" in the picker, the editor and the help article.')

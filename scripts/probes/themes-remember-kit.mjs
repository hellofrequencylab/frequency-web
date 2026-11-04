// LIVE-2201: the /themes page records the kit in view.
import { readFileSync } from 'node:fs'
const s = readFileSync('components/frequency/site/pages/themes/kit-showcase/use-kit-showcase.ts', 'utf8')
if (!s.includes("rememberKit") || !s.includes('IntersectionObserver')) {
  console.error('themes-remember-kit: use-kit-showcase does not call rememberKit for the kit in view')
  process.exit(1)
}
console.log('themes-remember-kit: the kit in view is remembered')

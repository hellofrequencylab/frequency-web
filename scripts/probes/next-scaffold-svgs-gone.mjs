// SCAN-1196: the create-next-app starter SVGs are not shipped in public/ (nothing reads them).
import { existsSync } from 'node:fs'
const left = ['file', 'globe', 'next', 'vercel', 'window'].map((n) => `public/${n}.svg`).filter(existsSync)
if (left.length) { console.error('FAIL: scaffold SVGs still in public/:', left.join(', ')); process.exit(1) }
console.log('ok')

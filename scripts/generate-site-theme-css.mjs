import { mkdirSync, writeFileSync } from 'node:fs'
import { envFlag } from '../lib/env/string.ts'
import { SITE_SKIN_NAMES, siteSkinCss } from '../components/sites/site-skin-css.ts'
import { themeStylesheetName } from '../components/sites/site-theme-stylesheet.ts'

if (process.env.VERCEL_ENV !== 'production' && envFlag('SITE_THEME_STYLESHEET_PILOT')) {
  const directory = 'public/_site-theme-assets'
  mkdirSync(directory, { recursive: true })
  for (const theme of [undefined, ...SITE_SKIN_NAMES]) {
    for (const look of [{}, { corners: 'square' }]) {
      const css = siteSkinCss(theme, look)
      writeFileSync(directory + '/' + themeStylesheetName(css), css)
    }
  }
}

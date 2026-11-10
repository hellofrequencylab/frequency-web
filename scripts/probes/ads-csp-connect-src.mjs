#!/usr/bin/env node
// LIVE-ADS-CSP-CONNECT-SRC: the site's connect-src lets Google's analytics and Ads calls through.
// Fails when next.config.ts drops one of the three hosts the linked GA4 tag calls.
import { readFileSync } from 'node:fs'
const s = readFileSync('next.config.ts', 'utf8')
const need = ['https://analytics.google.com', 'https://stats.g.doubleclick.net', 'https://www.google.com/g/collect']
const missing = need.filter((h) => !s.includes(h))
if (missing.length) { console.error('connect-src is missing: ' + missing.join(', ')); process.exit(1) }

// PURE: the shareable credential badge as a standalone SVG (served at /credentials/<id>/badge.svg and drawn
// on the credential page). A badge leaves the site (a Space page, a profile, an email signature), so it
// carries its own colors rather than the site's CSS tokens. They come from lib/theme/palette.ts, the
// one place raster and off-site surfaces read the brand from (the email and OG convention), never typed here.
import { palette } from '@/lib/theme/palette'
import type { CredentialLevel } from './credentials-types'

const NIGHT = palette.ink
const NIGHT_EDGE = palette.inkElevated
const GOLD = palette.primary
const TEXT = palette.onInk
const MUTED = palette.textMuted

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Break a course title onto at most two lines of about `width` characters. */
function lines(title: string, width = 26): string[] {
  const words = title.split(/\s+/)
  const out: string[] = ['']
  for (const w of words) {
    const cur = out[out.length - 1]!
    if ((cur + ' ' + w).trim().length > width && cur) {
      if (out.length === 2) {
        out[1] = `${cur}…`
        break
      }
      out.push(w)
    } else out[out.length - 1] = `${cur} ${w}`.trim()
  }
  return out
}

export function badgeSvg(args: { level: CredentialLevel; courseTitle: string; holder: string; year: string }): string {
  const label = args.level === 'certified' ? 'CERTIFIED' : 'ATTENDED'
  const title = lines(args.courseTitle)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360" role="img" aria-label="${esc(
    `${label}: ${args.courseTitle}, ${args.holder}, Frequency Creator Lab ${args.year}`,
  )}">
  <circle cx="180" cy="180" r="176" fill="${NIGHT}" stroke="${GOLD}" stroke-width="4"/>
  <circle cx="180" cy="180" r="156" fill="none" stroke="${NIGHT_EDGE}" stroke-width="2"/>
  <text x="180" y="92" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="4" fill="${MUTED}">FREQUENCY CREATOR LAB</text>
  <text x="180" y="146" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="5" fill="${GOLD}">${label}</text>
  ${title
    .map(
      (l, i) =>
        `<text x="180" y="${190 + i * 26}" text-anchor="middle" font-family="Georgia, serif" font-size="21" fill="${TEXT}">${esc(l)}</text>`,
    )
    .join('\n  ')}
  <text x="180" y="${title.length > 1 ? 262 : 238}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="${MUTED}">${esc(args.holder)} · ${esc(args.year)}</text>
</svg>`
}

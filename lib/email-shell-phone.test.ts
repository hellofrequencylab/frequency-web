import { describe, expect, it } from 'vitest'
import { emailShell, EMAIL_SHELL_STYLES } from '@/lib/email'
import { compileEmailDoc } from '@/lib/email-studio/shell'

// EMAIL-043. An email is a centred 600px column on a desktop and the full width of a phone: the outer cell has no
// side gutter, so the card meets the screen edge, and the phone rules drop the card's radius, side borders and
// shadow. Pinned on the shell the system mail and the Space mail share, and on the studio shell.

const PHONE_RULE = '[data-fq=fq-wrap]{padding:0 0 24px!important}'

describe('the phone layout', () => {
  it('has no side gutter on the outer cell, on every shell', () => {
    expect(EMAIL_SHELL_STYLES.wrap).toBe('padding:36px 0 48px;')
    const studio = compileEmailDoc({ layout: { rows: [], bench: [] } as never, subject: 's', preheader: '' })
    expect(studio.html).toContain('padding:36px 0 48px;')
    expect(studio.html).toContain(PHONE_RULE)
  })

  it('squares the card on a phone', () => {
    const html = emailShell('<p>hi</p>')
    expect(html).toContain(PHONE_RULE)
    expect(html).toContain('[data-fq=fq-card]{border-radius:0!important;border-left:0!important;border-right:0!important')
    expect(html).toContain('[data-fq=fq-hero]{border-radius:0!important}')
  })
})

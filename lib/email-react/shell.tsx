import type { CSSProperties, ReactNode } from 'react'
import { EMAIL_BASE_URL, EMAIL_SHELL_STYLES, emailHead, emailPostalAddress, type EmailFooter } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { emailType, pickStockHero } from '@/lib/theme/email-type'
import { EMAIL_TAGLINE } from '@/lib/email-studio/postal'

// THE REACT EMAIL BASE TEMPLATE (LIVE-695). The same brand wrapper `emailShell` (lib/email.ts)
// writes as a string: doctype, head, the wordmark and tagline, the card, and the footer with the
// unsubscribe control and the CAN-SPAM contact line. A new email composes its BODY as React and
// renders through `renderEmail` (./render.ts), so it never re-derives the layout. The styles are
// the shell's own constants (EMAIL_SHELL_STYLES), parsed once, so the two cannot drift while the
// string emails move across family by family. Receipts moved first (lib/email-react/receipt.tsx).

/** A CSS declaration string as a React style object ("font-size:15px;" → { fontSize: '15px' }). */
export function css(decls: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of decls.split(';')) {
    const i = decl.indexOf(':')
    if (i <= 0) continue
    const prop = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (!prop || !value) continue
    out[prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  return out as CSSProperties
}

const S = {
  body: css(EMAIL_SHELL_STYLES.body),
  container: css(EMAIL_SHELL_STYLES.container),
  card: css(EMAIL_SHELL_STYLES.card),
  cardBody: css(EMAIL_SHELL_STYLES.cardBody),
  hero: css(EMAIL_SHELL_STYLES.hero),
  logo: css(EMAIL_SHELL_STYLES.logo),
  tagline: css(EMAIL_SHELL_STYLES.tagline),
  footer: css(EMAIL_SHELL_STYLES.footer),
  unsub: css(EMAIL_SHELL_STYLES.unsub),
  wrap: css(EMAIL_SHELL_STYLES.wrap),
  header: css(EMAIL_SHELL_STYLES.header),
}

const MEMBER_FOOTER = `You're receiving this because you joined Frequency, the community collective.`

/** The string shell's <head> markup, parsed once: React cannot write MSO conditionals or a raw style block. */
const HEAD_INNER = emailHead().replace(/^<head>/, '').replace(/<\/head>$/, '')

export function EmailShell({ children, footer, hero: pick }: { children: ReactNode; footer?: string | EmailFooter; hero?: number }) {
  const hero = pickStockHero(pick)
  const foot = (typeof footer === 'string' ? footer : footer?.text) ?? MEMBER_FOOTER
  const showUnsub = typeof footer === 'object' ? footer.unsubscribe : true
  return (
    <html lang="en">
      {/* An email document, not a Next page: next/head does not apply here. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head dangerouslySetInnerHTML={{ __html: HEAD_INNER }} />
      <body data-fq="fq-bg" style={S.body}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} data-fq="fq-bg" style={{ width: '100%', borderCollapse: 'collapse', background: palette.emailCanvas, backgroundImage: emailType.wash || undefined }}>
          <tbody>
            <tr>
              <td align="center" data-fq="fq-wrap" style={S.wrap}>
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={S.container}>
                  <tbody>
                    {!hero && (
                      <tr>
                        <td data-fq="fq-head" style={S.header}>
                          <a href={EMAIL_BASE_URL} style={{ textDecoration: 'none' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- an email document, not a Next page */}
                            <img src={`${EMAIL_BASE_URL}${emailType.wordmark.path}`} alt={`Frequency, ${EMAIL_TAGLINE}`} width={emailType.wordmark.width} height={emailType.wordmark.height} data-fq="fq-logo" style={S.logo} />
                          </a>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td data-fq="fq-card" style={S.card}>
                        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {hero && (
                              <tr>
                                <td style={{ padding: 0, lineHeight: 0 }}>
                                  <a href={EMAIL_BASE_URL} style={{ textDecoration: 'none' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- an email document, not a Next page */}
                                    <img src={`${EMAIL_BASE_URL}${hero.path}`} alt={`Frequency, ${EMAIL_TAGLINE}`} width={hero.width} height={hero.height} data-fq="fq-hero" style={S.hero} />
                                  </a>
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td data-fq="fq-body" style={S.cardBody}>{children}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td data-fq="fq-foot" style={S.footer}>
                        <p style={{ margin: '0 0 10px' }}>{foot}</p>
                        {showUnsub && (
                          <p style={{ margin: '0 0 10px' }}>
                            <a href={`${EMAIL_BASE_URL}/settings/notifications`} style={S.unsub}>
                              Unsubscribe or manage emails
                            </a>
                          </p>
                        )}
                        {/* token-ok: an email document, rendered in mail clients where no token resolves */}
                        <p style={{ margin: 0, fontSize: '12px', color: palette.textMuted }}>{emailPostalAddress()}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

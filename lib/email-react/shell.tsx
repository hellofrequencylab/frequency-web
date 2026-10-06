import type { CSSProperties, ReactNode } from 'react'
import { EMAIL_BASE_URL, EMAIL_SHELL_STYLES, emailPostalAddress, type EmailFooter } from '@/lib/email'

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
  logo: css(EMAIL_SHELL_STYLES.logo),
  tagline: css(EMAIL_SHELL_STYLES.tagline),
  footer: css(EMAIL_SHELL_STYLES.footer),
  unsub: css(EMAIL_SHELL_STYLES.unsub),
}

const MEMBER_FOOTER = `You're receiving this because you joined Frequency, the community collective.`

export function EmailShell({ children, footer }: { children: ReactNode; footer?: string | EmailFooter }) {
  const foot = (typeof footer === 'string' ? footer : footer?.text) ?? MEMBER_FOOTER
  const showUnsub = typeof footer === 'object' ? footer.unsubscribe : true
  return (
    <html lang="en">
      {/* An email document, not a Next page: next/head does not apply here. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body style={S.body}>
        <div style={S.container}>
          <div style={S.card}>
            <a href={EMAIL_BASE_URL} style={S.logo}>
              frequency
            </a>
            <p style={S.tagline}>The community collective</p>
            {children}
          </div>
          <div style={S.footer}>
            <p style={{ margin: '0 0 14px' }}>{foot}</p>
            {showUnsub && (
              <a href={`${EMAIL_BASE_URL}/settings/notifications`} style={S.unsub}>
                Unsubscribe or manage emails
              </a>
            )}
            <p style={{ margin: '16px 0 0', color: '#A89E8C' /* token-ok: email HTML */ }}>{emailPostalAddress()}</p>
          </div>
        </div>
      </body>
    </html>
  )
}

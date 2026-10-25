import { EMAIL_ACTION, EMAIL_ACTION_INK, EMAIL_INK, EMAIL_MUTED, EMAIL_P, RECEIPT_FOOTER } from '@/lib/email'
import { EmailShell, css } from './shell'
import { palette } from '@/lib/theme/palette'
import { emailType } from '@/lib/theme/email-type'

// THE RECEIPT FAMILY ON REACT EMAIL (LIVE-695). One body for all four money receipts (order,
// tip, donation, subscription) and the earner's notice, inside the base template. PURE: it takes
// the receipt's data and nothing else, so lib/billing/__golden__ can pin what it renders. React
// escapes every value, which is what the string template did by hand.

interface ReceiptEmailLine {
  label: string
  value: string
}

interface ReceiptEmailProps {
  greeting: string
  lead: string
  lines: ReceiptEmailLine[]
  closing: string[]
  action: { label: string; url: string } | null
  /** The "Made with Frequency" mark (LIVE-804), or nothing. */
  madeWith?: { label: string; url: string } | null
}

const P_INK = css(`${EMAIL_P}color:${EMAIL_INK};`)
const P_MUTED = css(`${EMAIL_P}color:${EMAIL_MUTED};`)
const RULE = palette.emailBorder
const DETAIL = css(`margin:0 0 24px;width:100%;border-collapse:separate;background:${palette.emailSurfaceElevated};border:1px solid ${RULE};border-radius:20px;`)
const LABEL = css(`padding:12px 16px 12px 22px;font-size:14px;color:${EMAIL_MUTED};border-top:1px solid ${RULE};`)
const VALUE = css(`padding:12px 22px 12px 0;font-size:15px;color:${EMAIL_INK};font-weight:600;text-align:right;border-top:1px solid ${RULE};`)
const MADE_WITH = css(`margin:24px 0 0;font-size:12px;color:${EMAIL_MUTED};`)
const BUTTON = css(
  `display:inline-block;color:${EMAIL_ACTION_INK};font-family:${emailType.sans};font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:16px 24px;border-radius:999px;`,
)
const BUTTON_CELL = css(
  `background:${EMAIL_ACTION};${emailType.actionBackground ? `background-image:${emailType.actionBackground};` : ''}border-radius:999px;${emailType.actionGlow ? `box-shadow:${emailType.actionGlow};` : ''}`,
)

export function ReceiptEmail({ greeting, lead, lines, closing, action, madeWith }: ReceiptEmailProps) {
  // RECEIPT_FOOTER, not the member default: two receipt loops serve people with no account, so
  // "you joined Frequency" would be false there, and a receipt carries no unsubscribe (LIVE-365).
  return (
    <EmailShell footer={RECEIPT_FOOTER}>
      <p data-fq="fq-p" style={P_INK}>{greeting}</p>
      <p data-fq="fq-p" style={P_INK}>{lead}</p>
      {lines.length > 0 && (
        <table role="presentation" cellPadding={0} cellSpacing={0} style={DETAIL}>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={LABEL}>{l.label}</td>
                <td style={VALUE}>{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {action && (
        <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'separate', margin: '4px 0 24px' }}>
          <tbody>
            <tr>
              <td data-fq="fq-btn" style={BUTTON_CELL}>
                <a href={action.url} style={BUTTON}>
                  {action.label}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {closing.map((p, i) => (
        <p data-fq="fq-muted" key={i} style={P_MUTED}>
          {p}
        </p>
      ))}
      {madeWith && (
        <p data-fq="fq-muted" style={MADE_WITH}>
          <a href={madeWith.url} style={MADE_WITH}>
            {madeWith.label}
          </a>
        </p>
      )}
    </EmailShell>
  )
}

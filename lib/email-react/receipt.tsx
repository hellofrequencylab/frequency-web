import { EMAIL_ACTION, EMAIL_ACTION_INK, EMAIL_INK, EMAIL_MUTED, EMAIL_P, RECEIPT_FOOTER } from '@/lib/email'
import { EmailShell, css } from './shell'

// THE RECEIPT FAMILY ON REACT EMAIL (LIVE-695). One body for all four money receipts (order,
// tip, donation, subscription) and the earner's notice, inside the base template. PURE: it takes
// the receipt's data and nothing else, so lib/billing/__golden__ can pin what it renders. React
// escapes every value, which is what the string template did by hand.

export interface ReceiptEmailLine {
  label: string
  value: string
}

export interface ReceiptEmailProps {
  greeting: string
  lead: string
  lines: ReceiptEmailLine[]
  closing: string[]
  action: { label: string; url: string } | null
}

const P_INK = css(`${EMAIL_P}color:${EMAIL_INK};`)
const P_MUTED = css(`${EMAIL_P}color:${EMAIL_MUTED};`)
const RULE = '#E9E1D4' // token-ok: email HTML
const DETAIL = css(`margin:0 0 24px;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};width:100%;`)
const LABEL = css(`padding:6px 16px 6px 0;font-size:14px;color:${EMAIL_MUTED};`)
const VALUE = css(`padding:6px 0;font-size:14px;color:${EMAIL_INK};font-weight:600;`)
const BUTTON = css(
  `display:inline-block;background:${EMAIL_ACTION};color:${EMAIL_ACTION_INK};font-size:15px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:10px;`,
)

export function ReceiptEmail({ greeting, lead, lines, closing, action }: ReceiptEmailProps) {
  // RECEIPT_FOOTER, not the member default: two receipt loops serve people with no account, so
  // "you joined Frequency" would be false there, and a receipt carries no unsubscribe (LIVE-365).
  return (
    <EmailShell footer={RECEIPT_FOOTER}>
      <p style={P_INK}>{greeting}</p>
      <p style={P_INK}>{lead}</p>
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
        <p style={{ margin: '0 0 20px' }}>
          <a href={action.url} style={BUTTON}>
            {action.label}
          </a>
        </p>
      )}
      {closing.map((p, i) => (
        <p key={i} style={P_MUTED}>
          {p}
        </p>
      ))}
    </EmailShell>
  )
}

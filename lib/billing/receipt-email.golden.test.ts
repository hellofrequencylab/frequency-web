import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// GOLDEN RECEIPTS (LIVE-695). The receipt family renders through React Email
// (lib/email-react/receipt.tsx). These goldens pin what a member receives, so a change to the
// template is a reviewed diff, never an accident:
//   · <id>.visible.txt  the words a reader sees in the HTML, captured from the hand-built string
//                       template before the move. The React render must say exactly the same.
//   · <id>.txt          the plain-text part, byte for byte.
//   · <id>.html         the rendered HTML, byte for byte.
// `GOLDEN_WRITE=1` rewrites the .html and .txt files after a deliberate change. The visible-text
// files are only ever rewritten on purpose, by hand-checking the diff.

import { receiptHtml, receiptText, type ReceiptContent } from './receipt-email'

const DIR = join(process.cwd(), 'lib/billing/__golden__')

const FIXTURES: Record<string, ReceiptContent> = {
  'order-buyer': {
    greetingName: 'Maya',
    lead: 'Your order from North Light Yoga is paid, $45 in total.',
    lines: [
      { label: 'Order', value: '5 class pass' },
      { label: 'Total', value: '$45' },
      { label: 'Seller', value: 'North Light Yoga' },
      { label: 'Date', value: 'October 6, 2026' },
    ],
    closing: [
      'North Light Yoga can see the order now and will send it on.',
      'My orders keeps every purchase you make on Frequency, with the seller and the total.',
    ],
    actionLabel: 'See my orders',
    actionUrl: 'https://frequencylocal.com/orders',
  },
  'seller-notice': {
    greetingName: 'Sam & "Co" <Studio>',
    lead: 'Maya bought Two mugs x2 for $30.',
    lines: [
      { label: 'Order', value: 'Two mugs x2' },
      { label: 'Total', value: '$30' },
      { label: 'Buyer', value: 'Maya' },
      { label: 'Date', value: '' },
    ],
    closing: ['The money goes to your payout account on your usual payout schedule.', ''],
    actionLabel: 'Open Orders',
    actionUrl: 'https://frequencylocal.com/spaces/north-light/manage/orders?tab=open&x=1',
  },
  'donation-guest': {
    greetingName: null,
    lead: 'Thank you for giving $25 to Tidepool Trust.',
    lines: [{ label: 'Amount', value: '$25' }],
    closing: ['Keep this email for your records.'],
  },
}

/** The words a reader sees: tags out, entities decoded, whitespace collapsed. */
function visibleText(html: string): string {
  return html
    .replace(/<head>[\s\S]*?<\/head>/i, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function golden(file: string, actual: string, writeVar: string): void {
  const path = join(DIR, file)
  if (process.env[writeVar] || !existsSync(path)) writeFileSync(path, actual)
  expect(actual).toBe(readFileSync(path, 'utf8'))
}

describe('the receipt family renders exactly what it rendered before', () => {
  for (const [id, content] of Object.entries(FIXTURES)) {
    it(id, async () => {
      const html = await receiptHtml(content)
      golden(`${id}.visible.txt`, visibleText(html) + '\n', 'GOLDEN_VISIBLE_WRITE')
      golden(`${id}.txt`, receiptText(content), 'GOLDEN_WRITE')
      golden(`${id}.html`, html, 'GOLDEN_WRITE')
    })
  }
})

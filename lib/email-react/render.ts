import 'server-only'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'

/** Render a React Email element to the HTML string the outbox stores (LIVE-695). */
export function renderEmail(element: ReactElement): Promise<string> {
  return render(element)
}

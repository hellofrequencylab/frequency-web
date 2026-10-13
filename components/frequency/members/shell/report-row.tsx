'use client'

import { FqIcon } from '@/components/frequency/icon'

// Report a bug, in the kit's idiom. The same global support sheet as the DAWN rail's ReportButton
// (components/support/support-launcher.tsx listens for `open-support`); dispatched here directly so
// the shell does not carry lucide or DAWN's button classes.
export function ReportRow() {
  return (
    <button
      type="button"
      className="fqm-util"
      onClick={() => window.dispatchEvent(new CustomEvent('open-support', { detail: { type: 'bug' } }))}
    >
      <span className="fqm-util-ic" aria-hidden>
        <FqIcon name="flag" />
      </span>
      <span className="fqm-grow">
        <b>Report a bug</b>
        <small>Tell us what broke and where.</small>
      </span>
    </button>
  )
}

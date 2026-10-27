const notices: Record<string, string> = {
  missing_state: 'The search provider returned without the connection check. No credentials were saved. Open your Space’s Coach preferences and start a new connection.',
  malformed_state: 'The search provider returned an incomplete or changed connection check. No credentials were saved. Open your Space’s Coach preferences and start a new connection.',
  rejected_state: 'This connection attempt could not be confirmed. It may have expired or been replaced, or your sign-in or permissions may have changed. No credentials were saved. Open your Space’s Coach preferences and start a new connection.',
}

/** Only fixed local outcomes are rendered. Never display provider errors, codes or state values. */
export function SearchConnectionNotice({ outcome }: { outcome: unknown }) {
  if (typeof outcome !== 'string' || !Object.hasOwn(notices, outcome)) return null
  return <p role="status">{notices[outcome]}</p>
}

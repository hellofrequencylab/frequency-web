const notices: Record<string, string> = {
  token_exchange_failed: 'The provider’s approval could not be exchanged for a read-only connection. No credentials were saved. Start a new connection from Coach preferences.',
  property_scope_changed: 'The property or your permission to connect it changed during this attempt. No credentials were saved. Check your Space’s published website and provider access, then start a new connection.',
  provider_property_unverified: 'The provider did not confirm verified access to this exact property. No credentials were saved. Check the property and owner account in the provider, then start a new connection.',
  provider_auth_failed: 'The read-only authorization could not be confirmed for the property check. No credentials were saved. Check your provider account and start a new connection.',
  property_provider_unavailable: 'The provider’s property check was unavailable. No credentials were saved. Try a new connection later.',
  property_provider_invalid_response: 'The provider returned a property response we could not verify. No credentials were saved. Try a new connection later.',
  property_provider_rate_limited: 'The provider has limited property-check requests. No credentials were saved. Wait before starting a new connection.',
  storage_failed: 'The verified connection could not be saved. This attempt did not complete. Start a new connection from Coach preferences.',
  provider_invalid_scope: 'The search provider did not accept the read-only connection request. No credentials were saved. Open your Space’s Coach preferences and start a new connection. If this continues, check the provider setup.',
  missing_state: 'The search provider returned without the connection check. No credentials were saved. Open your Space’s Coach preferences and start a new connection.',
  malformed_state: 'The search provider returned an incomplete or changed connection check. No credentials were saved. Open your Space’s Coach preferences and start a new connection.',
  rejected_state: 'This connection attempt could not be confirmed. It may have expired or been replaced, or your sign-in or permissions may have changed. No credentials were saved. Open your Space’s Coach preferences and start a new connection.',
}

/** Only fixed local outcomes are rendered. Never display provider errors, codes or state values. */
export function SearchConnectionNotice({ outcome }: { outcome: unknown }) {
  if (typeof outcome !== 'string' || !Object.hasOwn(notices, outcome)) return null
  return <p role="status">{notices[outcome]}</p>
}

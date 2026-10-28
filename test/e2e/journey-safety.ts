/** Parse external destinations before matching; substrings are not trusted origins. */
function parsed(value: string | URL): URL | null {
  try { return new URL(value) } catch { return null }
}

export function stripeDestination(value: string | URL, kind: 'checkout' | 'iframe'): boolean {
  const url = parsed(value)
  return !!url && url.protocol === 'https:' && !url.username && !url.password &&
    url.origin === (kind === 'checkout' ? 'https://checkout.stripe.com' : 'https://js.stripe.com')
}

export function localHttpDestination(value: string | undefined): boolean {
  if (!value) return false
  const url = parsed(value)
  return !!url && url.protocol === 'http:' && !url.username && !url.password &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export function journeyWritesAllowed(enabled: string | undefined, base: string | undefined, database: string | undefined): { ok: boolean; why: string } {
  if (enabled !== '1') return { ok: false, why: 'PW_JOURNEY_WRITES is not 1' }
  if (!localHttpDestination(base) || !localHttpDestination(database)) return { ok: false, why: 'Write journeys require a loopback HTTP app and disposable local Supabase; never frequencylocal.com or a hosted preview' }
  return { ok: true, why: '' }
}

export function localAuthLink(value: string, base: string, supabase: string): boolean {
  const url = parsed(value)
  if (!url || !localHttpDestination(value) || !localHttpDestination(base) || !localHttpDestination(supabase)) return false
  return (url.origin === new URL(supabase).origin && url.pathname === '/auth/v1/verify') ||
    (url.origin === new URL(base).origin && ['/auth/confirm', '/auth/callback'].includes(url.pathname))
}

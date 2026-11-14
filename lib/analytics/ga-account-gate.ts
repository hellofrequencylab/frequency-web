/** Self-contained so the same gate can run while HTML parses and after client navigation. */
export function applyGaAccountGate(id: string, disabled: boolean): void {
  if (typeof window === 'undefined') return
  const state = window as unknown as Record<string, unknown>
  const wasPending = state.__fqGaAccountPending === true
  state.__fqGaAccountResolved = true
  state.__fqGaAccountPending = false
  const wasDisabled = state.__fqGaAccountDisabled === true
  state.__fqGaAccountDisabled = disabled
  if (disabled) { state[`ga-disable-${id}`] = true; return }
  const cookies = document.cookie.split(';').map((part) => part.trim())
  const choice = cookies.find((part) => part.startsWith('fq_consent='))?.slice('fq_consent='.length)
  const prior = cookies.includes('fq_ask=1')
  let staff = true
  try { staff = window.localStorage.getItem('freq-ga-optout') === '1' } catch { /* retain exclusion when unknown */ }
  const blocked = staff || state.__fqGaBrowserDisabled === true || choice === 'denied' || (prior && choice !== 'granted')
  if (wasDisabled || wasPending) state[`ga-disable-${id}`] = blocked
  if (!blocked) window.__fqGa?.()
}

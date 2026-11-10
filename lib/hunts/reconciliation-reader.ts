/** Scope is resolved from the current session by the caller, never from a URL or form. */
export type HuntReconciliationScope =
  | { role: 'platform-admin' }
  | { role: 'space-owner'; spaceId: string }

type HuntReconciliationRow = Readonly<{
  amountMinor: number
  currency: string
  status: 'matched' | 'pending' | 'exception'
  ageMinutes: number
  sourceType: 'event-ticket' | 'store-order'
  /** Short, lowercase hexadecimal digest. The reader must never return a raw source id. */
  sourceHash: string
}>

/** The adapter enforces scope on every read and returns only this redacted projection. */
export type HuntReconciliationReader = (
  scope: HuntReconciliationScope,
) => Promise<readonly HuntReconciliationRow[]>

/** A visible dead-letter that automatic retry must not override (policy, immutable payload, uncertainty). */
export class TerminalQueueError extends Error {
  readonly terminalQueueFailure = true
}

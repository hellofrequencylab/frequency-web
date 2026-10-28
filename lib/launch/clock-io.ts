// THE LAUNCH CLOCK (the read half). Placeholder for the design render: the real one reads the active time kept on the
// launch row. Server-only.
import type { ClockView } from './clock'
import type { LaunchSnapshot } from './state'

export async function loadClock(_launch: LaunchSnapshot | null): Promise<{ view: ClockView; variant: 'pill' | 'hero' } | null> {
  return null
}

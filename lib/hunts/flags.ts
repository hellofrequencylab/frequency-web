/**
 * Frequency Hunts capability switches (FH-011). Every Hunt capability ships dark: blank means off,
 * and `1` / `true` / `on` means on (envFlag). Each switch needs the one before it, so switching a
 * lower rung on alone never opens a path to something above it that is still off. Reads happen at
 * call time so a test can set the variable and ask again.
 *
 * Rungs, lowest first:
 *   HUNTS_ENABLED          public browse, entry and the player's own run
 *   HUNTS_CLAIMS_ENABLED   a scan or proof may credit a mission (hunt_claim_apply)
 *   HUNTS_REWARDS_ENABLED  a credit may grant a reward through the outbox
 *   HUNTS_AUTHORING_ENABLED  creators may draft and publish Hunts
 *   HUNTS_WORKER_ENABLED   the outbox worker may lease and deliver rows
 *
 * Authoring and the worker are independent of the player rungs, but each still needs HUNTS_ENABLED.
 */
import { envFlag } from '@/lib/env/string'

export type HuntSwitch = 'enabled' | 'claims' | 'rewards' | 'authoring' | 'worker'

export const HUNT_SWITCH_KEYS: Record<HuntSwitch, string> = {
  enabled: 'HUNTS_ENABLED',
  claims: 'HUNTS_CLAIMS_ENABLED',
  rewards: 'HUNTS_REWARDS_ENABLED',
  authoring: 'HUNTS_AUTHORING_ENABLED',
  worker: 'HUNTS_WORKER_ENABLED',
}

/** What each switch needs on first. A switch is on only when its own variable and every parent are on. */
const PARENT: Record<HuntSwitch, HuntSwitch | null> = {
  enabled: null,
  claims: 'enabled',
  rewards: 'claims',
  authoring: 'enabled',
  worker: 'enabled',
}

export function huntSwitchOn(name: HuntSwitch): boolean {
  if (!envFlag(HUNT_SWITCH_KEYS[name])) return false
  const parent = PARENT[name]
  return parent ? huntSwitchOn(parent) : true
}

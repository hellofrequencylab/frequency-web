import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  AGENT_PROMPT,
  PARKED_IDS,
  OFF_LIMITS_BRANCHES,
  classifyLane,
  isWorkable,
  buildPackets,
  nextPerLane,
  extractPaths,
  collisionReport,
  pendingMigrations,
} from './agent-packets.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts/agent-packets.mjs')

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() })
}

describe('agent packets (ADR-1412)', () => {
  it('classifies the product-first money and event rows onto parallel lanes', () => {
    expect(classifyLane({ id: 'LIVE-410', title: 'Selling memberships is gated on Business plan', detail: '', lane: 'live' })).toBe(
      'money',
    )
    expect(
      classifyLane({
        id: 'LIVE-376',
        title: 'A host cannot tell how to attach their event to their own Space',
        detail: 'host_space_id',
        lane: 'live',
      }),
    ).toBe('events')
    expect(classifyLane({ id: 'HYG-102', title: 'award_gems CREATE OR REPLACE', detail: '', lane: 'hygiene' })).toBe(
      'hygiene',
    )
    expect(classifyLane({ id: 'LIVE-393', title: 'What you will learn', detail: 'OutcomesBlock', lane: 'live' })).toBe(
      'journey',
    )
    expect(
      classifyLane({
        id: 'SCAN-636',
        title: 'The ISR event page canonicals onto a fully dynamic route',
        detail: '',
        lane: 'live',
      }),
    ).toBe('scan')
    expect(
      classifyLane({
        id: 'LIVE-412',
        title: 'Split app-shell',
        detail: 'components/layout/app-shell.tsx',
        lane: 'hygiene',
      }),
    ).toBe('scan')
  })

  it('refuses parked 16-to-7 nav and owner-gated rows unless asked', () => {
    expect(PARKED_IDS.has('LIVE-241')).toBe(true)
    expect(isWorkable({ id: 'LIVE-241', status: 'open', lane: 'live' })).toBe(false)
    expect(isWorkable({ id: 'LIVE-410', status: 'open', lane: 'live' })).toBe(true)
    expect(
      isWorkable({ id: 'LIVE-408', status: 'open', lane: 'live', ownerAction: 'ruling' }),
    ).toBe(false)
    expect(
      isWorkable({ id: 'LIVE-234', status: 'open', lane: 'live', ownerAction: 'account' }),
    ).toBe(false)
    expect(isWorkable({ id: 'OWN-077', status: 'open', lane: 'owner', ownerAction: 'content' })).toBe(false)
  })

  it('extracts collision paths from a probe and flags shared files', () => {
    const a = {
      id: 'A',
      title: 'x',
      source: { file: 'lib/pricing/gates.ts' },
      verify: { paths: ['lib/pricing/gates.ts'] },
    }
    const b = {
      id: 'B',
      title: 'y',
      verify: { cmd: 'node -e "require(\'lib/pricing/gates.ts\')"' },
    }
    expect(extractPaths(a)).toContain('lib/pricing/gates.ts')
    const report = collisionReport([
      { ...a, paths: extractPaths(a) },
      { ...b, paths: extractPaths(b) },
    ])
    expect(report.sharedFiles.some((s) => s.file === 'lib/pricing/gates.ts')).toBe(true)
    expect(OFF_LIMITS_BRANCHES).toContain('cursor/cloud-agent-workspace-8978')
  })

  it('prints one next packet per derived lane from the real backlog', () => {
    const next = nextPerLane(
      buildPackets({
        meta: { slate: { waves: [{ name: 'W0b', ids: ['LIVE-410', 'LIVE-376', 'HYG-102'] }] } },
        entries: [
          { id: 'LIVE-410', title: 'memberships', status: 'open', priority: 'P1', lane: 'live' },
          { id: 'LIVE-376', title: 'attach event', status: 'open', priority: 'P1', lane: 'live', detail: 'host_space' },
          { id: 'HYG-102', title: 'gems', status: 'open', priority: 'P2', lane: 'hygiene' },
          { id: 'LIVE-411', title: 'later money', status: 'open', priority: 'P2', lane: 'live', detail: 'stripe checkout' },
        ],
      }),
    )
    const byLane = Object.fromEntries(next.map((p) => [p.derivedLane, p.id]))
    expect(byLane.money).toBe('LIVE-410')
    expect(byLane.events).toBe('LIVE-376')
    expect(byLane.hygiene).toBe('HYG-102')
  })

  it('lists repo migrations without claiming ledger parity when no ledger is passed', () => {
    const r = pendingMigrations(null)
    expect(r.compared).toBe(false)
    expect(r.repoCount).toBeGreaterThan(400)
  })

  it('CLI --prompt encodes ManagePullRequest, execute_sql, and the off-limits branch', () => {
    const { status, stdout } = run(['--prompt'])
    expect(status).toBe(0)
    expect(stdout).toContain('ManagePullRequest')
    expect(stdout).toContain('gh pr merge --auto --squash')
    expect(stdout).toContain('execute_sql')
    expect(stdout).toContain('cursor/cloud-agent-workspace-8978')
    expect(stdout).toContain('LIVE-410')
    expect(AGENT_PROMPT).toContain('Never stamp wall-clock versions')
  })

  it('CLI --json names SCAN-644 on the scan lane from the real file', () => {
    const { status, stdout, stderr } = run(['--json', '--lane', 'scan'])
    expect(status, stderr).toBe(0)
    const body = JSON.parse(stdout)
    expect(body.next[0].id).toBe('SCAN-644')
    expect(body.next[0].derivedLane).toBe('scan')
    expect(body.packets.some((p: { id: string }) => p.id === 'LIVE-410')).toBe(false)
    expect(body.packets.some((p: { id: string }) => p.id === 'SCAN-636')).toBe(false)
    expect(body.packets.some((p: { id: string }) => p.id === 'SCAN-638')).toBe(false)
  })

  it('CLI --json names no closed LIVE-410 or LIVE-306 on the money lane', () => {
    const { status, stdout, stderr } = run(['--json', '--lane', 'money'])
    expect(status, stderr).toBe(0)
    const body = JSON.parse(stdout)
    expect(body.packets.some((p: { id: string }) => p.id === 'LIVE-410')).toBe(false)
    expect(body.packets.some((p: { id: string }) => p.id === 'LIVE-306')).toBe(false)
    expect(body.packets.some((p: { id: string }) => p.id === 'LIVE-376')).toBe(false)
    if (body.next[0]) {
      expect(body.next[0].derivedLane).toBe('money')
      expect(body.next[0].id).not.toBe('LIVE-410')
      expect(body.next[0].id).not.toBe('LIVE-306')
    }
  })
})

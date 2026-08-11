import { describe, it, expect } from 'vitest'
import {
  assess,
  expandField,
  envSlug,
  fmtMinutes,
  freshByMinutes,
  handlerWiring,
  isDeploymentRuntime,
  main,
  monitorFor,
  parseSchedule,
  readModel,
  renderMarkdown,
  renderText,
  stripComments,
  MIN_JOBS,
  MONITOR_CAPACITY,
} from './cron-freshness.mjs'

// Self-test for the cron freshness contract checker, which now runs weekly in maintenance.yml
// with nobody reading it live. That is the whole reason these tests exist: every number this
// prints is now consumed by a machine on a schedule, so a window that is silently wrong is worse
// than no window at all.
//
// No live call anywhere: every case drives the io seam (a vercel.json string, a directory
// listing, a route file, an env object).

type Io = Parameters<typeof readModel>[0]

const CRONS = [
  { path: '/api/cron/process-queue', schedule: '*/2 * * * *' },
  { path: '/api/cron/journey-drips', schedule: '15,45 * * * *' },
  { path: '/api/cron/billing-renewals', schedule: '10 4 * * *' },
  { path: '/api/cron/weekly-digest', schedule: '0 14 * * 0' },
]

/** A corpus above MIN_JOBS so the floor never fires on the cases that are about something else. */
function crons(n = MIN_JOBS + 5) {
  const out = [...CRONS]
  for (let i = out.length; i < n; i++) out.push({ path: `/api/cron/job-${i}`, schedule: `${i % 60} 3 * * *` })
  return out
}

const wrapped = (job: string) => `import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'\nexport const GET = withCronHeartbeat('${job}', async () => new Response('ok'))\n`

/** The seam the real run uses: vercel.json on one side, the route tree + env on the other. */
function io(over: {
  crons?: Array<{ path: string; schedule: string }>
  route?: (job: string) => string | null
  dirs?: string[]
  env?: Record<string, string>
  vercelJson?: string
} = {}): Io {
  const list = over.crons ?? crons()
  const jobs = list.map((c) => c.path.split('/').pop() as string)
  const route = over.route ?? ((job: string) => wrapped(job))
  const files = new Map<string, string>()
  for (const job of jobs) {
    const src = route(job)
    if (src !== null) files.set(`app/api/cron/${job}/route.ts`, src)
  }
  return {
    read: (p: string) => {
      if (p === 'vercel.json') return over.vercelJson ?? JSON.stringify({ crons: list })
      const f = files.get(p)
      if (f === undefined) throw new Error(`ENOENT ${p}`)
      return f
    },
    exists: (p: string) => p === 'vercel.json' || files.has(p),
    readdir: () => over.dirs ?? jobs,
    env: over.env ?? {},
  }
}

describe('the schedule parser, because every fresh-by number is derived from it', () => {
  it('reads the shapes vercel.json actually uses', () => {
    expect(parseSchedule('*/2 * * * *')).toMatchObject({ parsed: true, minutes: 2, label: 'every 2 min' })
    expect(parseSchedule('*/30 * * * *')).toMatchObject({ parsed: true, minutes: 30 })
    expect(parseSchedule('5 * * * *')).toMatchObject({ parsed: true, minutes: 60, label: 'hourly' })
    expect(parseSchedule('10 4 * * *')).toMatchObject({ parsed: true, minutes: 1440, label: 'daily' })
    expect(parseSchedule('0 14 * * 0')).toMatchObject({ parsed: true, minutes: 10080, label: 'weekly' })
  })

  it('THE BUG: a minute list is 30 minutes apart, not a day', () => {
    // `journey-drips` is `15,45 * * * *`. The old parser had no case for a comma list, fell back
    // to "assume daily", and published a fresh-by window of 2 days for a job that runs every 30
    // minutes: 96x too loose, printed as a fact. It could be dead for a day and a half inside its
    // own contract.
    const r = parseSchedule('15,45 * * * *')
    expect(r.parsed).toBe(true)
    expect(r.minutes).toBe(30)
    expect(freshByMinutes(r.minutes as number)).toBe(60)
  })

  it('takes the LARGEST gap in the cycle, so a healthy job is never paged early', () => {
    // Two runs a minute apart then 59 minutes of legitimate silence. Fresh-by has to cover the 59.
    expect(parseSchedule('0,1 * * * *').minutes).toBe(59)
    expect(parseSchedule('0 0,1 * * *').minutes).toBe(1380)
  })

  it('handles ranges, steps within ranges, and multi-day weeks', () => {
    expect(parseSchedule('0 9-17 * * *').minutes).toBe(960) // 17:00 to 09:00 next day
    expect(parseSchedule('0 0-23/6 * * *').minutes).toBe(360)
    expect(parseSchedule('0 12 * * 1,4').minutes).toBe(5760) // Thu noon to Mon noon, the longer leg
    expect(parseSchedule('0 12 * * 7').minutes).toBe(10080) // 7 is Sunday, same as 0
  })

  it('REFUSES a shape it does not understand instead of guessing a window', () => {
    // The old fallback silently returned 1440 for anything unrecognised. A refusal is reported and
    // fixed; a guess is believed.
    for (const s of ['', 'nonsense', '* * * *', '0 12 1 * *', '0 12 * 3 *', '0 12 1 * 1', '0 99 * * *']) {
      expect(parseSchedule(s).parsed, s).toBe(false)
    }
  })

  it('expandField refuses rather than clamping out-of-range values', () => {
    expect(expandField('*/15', 0, 59)).toEqual([0, 15, 30, 45])
    expect(expandField('1-3', 0, 59)).toEqual([1, 2, 3])
    expect(expandField('58/1', 0, 59)).toEqual([58, 59])
    expect(expandField('61', 0, 59)).toBeNull()
    expect(expandField('5-1', 0, 59)).toBeNull()
    expect(expandField('*/0', 0, 59)).toBeNull()
    expect(expandField('a', 0, 59)).toBeNull()
  })

  it('fresh-by is the interval plus one interval of grace', () => {
    expect(freshByMinutes(2)).toBe(4)
    expect(fmtMinutes(10080)).toBe('7 d')
    expect(fmtMinutes(null as unknown as number)).toBe('unknown')
  })
})

describe('the wiring half, which is what the repo alone can prove', () => {
  it('a wrapped handler under its own name is the passing state', () => {
    const w = handlerWiring('process-queue', io())
    expect(w.state).toBe('wrapped')
    expect(w.name).toBe('process-queue')
  })

  it('a handler that never pings is caught, and no env setting can rescue it', () => {
    const bare = io({ route: () => 'export const GET = async () => new Response("ok")\n' })
    expect(handlerWiring('process-queue', bare).state).toBe('bare')
    // Even with a monitor URL resolving for every job, a bare handler is still a failure.
    const a = assess(readModel(io({ route: () => 'export const GET = async () => new Response("ok")\n', env: { CRON_HEARTBEAT_BASE_URL: 'https://hc-ping.com/k' } })), {
      CRON_HEARTBEAT_BASE_URL: 'https://hc-ping.com/k',
    })
    expect(a.coverage).toBe('covered')
    expect(a.failed).toBe(true)
    expect(renderMarkdown(a)).toContain('cannot ping any monitor, whatever the env says')
  })

  it('a name that does not match the route is caught, because both slugs then miss', () => {
    const w = handlerWiring('process-queue', io({ route: () => wrapped('process_queue') }))
    expect(w.state).toBe('mismatch')
    expect(w.name).toBe('process_queue')
    const a = assess(readModel(io({ route: (j) => wrapped(`${j}-old`) })))
    expect(a.failed).toBe(true)
    expect(renderMarkdown(a)).toContain('CRON_HEARTBEAT_URL_')
  })

  it('a scheduled path with no handler is caught: Vercel 404s and the job never runs', () => {
    expect(handlerWiring('process-queue', io({ route: () => null })).state).toBe('missing')
  })

  it('is comment-blind, so a wrapper named only in a comment is not read as wiring', () => {
    const commented = "// export const GET = withCronHeartbeat('process-queue', h)\nexport const GET = h\n"
    expect(handlerWiring('process-queue', io({ route: () => commented })).state).toBe('bare')
    expect(stripComments('/* withCronHeartbeat("x") */ a')).not.toContain('withCronHeartbeat')
  })

  it('a handler nobody schedules is reported, since nothing invokes it', () => {
    const listing = [...crons().map((c) => c.path.split('/').pop() as string), 'orphan-job']
    const a = assess(readModel(io({ dirs: listing })))
    expect(a.unscheduled).toEqual(['orphan-job'])
    // Reported, not failed: an unscheduled handler is dead code, not a paging blind spot.
    expect(a.failed).toBe(false)
    expect(renderMarkdown(a)).toContain('orphan-job')
  })
})

describe('the monitor half, which this process cannot observe', () => {
  it('resolves per-job before base, exactly as resolveHeartbeatUrl does', () => {
    expect(envSlug('space-follower-event-reminders')).toBe('SPACE_FOLLOWER_EVENT_REMINDERS')
    expect(monitorFor('weekly-digest', { CRON_HEARTBEAT_URL_WEEKLY_DIGEST: 'u', CRON_HEARTBEAT_BASE_URL: 'b' })).toBe('per-job')
    expect(monitorFor('weekly-digest', { CRON_HEARTBEAT_BASE_URL: 'b' })).toBe('base')
    expect(monitorFor('weekly-digest', {})).toBeNull()
  })

  it('an unset var off the deployment runtime is NOT ESTABLISHED, never "paging-blind"', () => {
    // The claim this file used to make on every machine. After the owner armed the base URL in
    // Vercel on 2026-08-11 it was still printing "27 paging-blind" about a covered system.
    const a = assess(readModel(io()), {})
    expect(a.coverage).toBe('not-established')
    expect(a.failed).toBe(false)
    const out = renderMarkdown(a)
    expect(out).toContain('NOT ESTABLISHED')
    expect(out).not.toContain('paging-blind')
  })

  it('an unset var ON the deployment runtime IS blind, because absence is then real', () => {
    const a = assess(readModel(io({ env: { VERCEL: '1' } })), { VERCEL: '1' })
    expect(a.coverage).toBe('blind')
    expect(isDeploymentRuntime({ VERCEL: '1' })).toBe(true)
    expect(isDeploymentRuntime({})).toBe(false)
    expect(renderMarkdown(a)).toContain('paging-blind')
  })

  it('partial resolution off the runtime says partial, not blind for the remainder', () => {
    const env = { CRON_HEARTBEAT_URL_PROCESS_QUEUE: 'u' }
    const a = assess(readModel(io({ env })), env)
    expect(a.coverage).toBe('partial')
    expect(a.failed).toBe(false)
    expect(renderMarkdown(a)).toContain('NOT ESTABLISHED')
  })

  it('never claims a clean bill of health from a resolving base key alone', () => {
    // A base ping key resolves a URL for all 27 jobs. The Healthchecks free tier holds 20 and
    // rejects the rest, so "covered" here is resolution, not provisioning, and the report says so.
    const env = { CRON_HEARTBEAT_BASE_URL: 'https://hc-ping.com/k' }
    const a = assess(readModel(io({ crons: crons(MONITOR_CAPACITY + 7), env })), env)
    expect(a.coverage).toBe('covered')
    expect(a.overCapacity).toBe(true)
    expect(renderMarkdown(a)).toContain('A URL that resolves is not a check that exists')
  })

  it('stops flagging capacity once the job count fits', () => {
    const env = { CRON_HEARTBEAT_BASE_URL: 'https://hc-ping.com/k' }
    const a = assess(readModel(io({ crons: crons(MONITOR_CAPACITY), env })), env)
    expect(a.overCapacity).toBe(false)
  })
})

describe('the floor', () => {
  it('refuses a corpus too small to believe rather than reporting perfect coverage', () => {
    // Zero crons means zero uncovered crons. Without the floor, an unreadable vercel.json prints a
    // flawless coverage table, which is this repo's named failure mode.
    expect(() => readModel(io({ crons: [] }))).toThrow(/expected at least/)
    expect(() => readModel(io({ crons: crons(3) }))).toThrow(/broken read rather than a clean run/)
  })

  it('refuses a vercel.json with no crons array, and an unparseable one', () => {
    expect(() => readModel(io({ vercelJson: '{"functions":{}}' }))).toThrow(/no `crons` array/)
    expect(() => readModel(io({ vercelJson: 'not json' }))).toThrow(/could not read vercel.json/)
  })

  it('sits under the live corpus with real headroom', () => {
    const { jobs } = readModel()
    expect(jobs.length).toBe(27)
    expect(jobs.length).toBeGreaterThan(MIN_JOBS)
  })
})

describe('the live tree', () => {
  it('every scheduled cron is wired to the heartbeat under its own name', () => {
    const a = assess(readModel(), {})
    expect(a.badWiring.map((j) => `${j.job}:${j.wiring.state}`)).toEqual([])
    expect(a.unparsedJobs.map((j) => j.job)).toEqual([])
    expect(a.unscheduled).toEqual([])
    expect(a.failed).toBe(false)
  })

  it('journey-drips carries an hourly window, not the two-day one it used to advertise', () => {
    const { jobs } = readModel()
    const drips = jobs.find((j) => j.job === 'journey-drips')
    expect(drips?.intervalMin).toBe(30)
    expect(drips?.freshByMin).toBe(60)
  })

  it('the table names every job and its window', () => {
    const out = renderText(assess(readModel(), {}))
    expect(out).toContain('space-follower-event-reminders')
    expect(out).toContain('Fresh-by')
  })
})

describe('exit codes, which decide what the weekly sweep opens an issue about', () => {
  const quiet = () => {
    const log = console.log
    console.log = () => {}
    return () => {
      console.log = log
    }
  }

  it('is ADVISORY about coverage: unestablished exits 0', () => {
    // A red run here would be a run failing for a fact about someone else's dashboard, which no
    // pull request can change. ADR-970, and check:research-freshness for the same split.
    const restore = quiet()
    expect(main(['--markdown'], io())).toBe(0)
    restore()
  })

  it('is STRICT about the wiring, which is a fact about the tree', () => {
    const restore = quiet()
    expect(main(['--markdown'], io({ route: () => 'export const GET = h\n' }))).toBe(1)
    expect(main(['--markdown'], io({ crons: [...crons(), { path: '/api/cron/odd', schedule: '0 12 1 * *' }] }))).toBe(1)
    restore()
  })

  it('--strict refuses to pass on evidence it does not have', () => {
    // For a caller that HAS the deployment env. Off it, "cannot establish" must not read as pass.
    const restore = quiet()
    expect(main(['--strict'], io())).toBe(1)
    expect(main(['--strict'], io({ env: { CRON_HEARTBEAT_BASE_URL: 'b' } }))).toBe(0)
    restore()
  })

  it('--json stays machine-readable for anything downstream', () => {
    const lines: string[] = []
    const log = console.log
    console.log = (s: string) => lines.push(s)
    main(['--json'], io())
    console.log = log
    const parsed = JSON.parse(lines.join('\n'))
    expect(parsed.jobCount).toBe(crons().length)
    expect(parsed.coverage).toBe('not-established')
    expect(parsed.jobs[0].heartbeat).toBe('wrapped')
  })
})

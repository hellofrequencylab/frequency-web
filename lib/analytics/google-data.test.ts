import { describe, expect, it, vi } from 'vitest'
import { GOOGLE_DATA_REPORTS, googleReportRequest, googleReportingConfig, parseGoogleReport, readGoogleReports } from './google-data'

const body = (i = 0) => {
  const spec = GOOGLE_DATA_REPORTS[i]
  return {
    dimensionHeaders: spec.dimensions.map((name) => ({ name })), metricHeaders: spec.metrics.map((name) => ({ name })),
    rowCount: 1,
    rows: [{ dimensionValues: spec.dimensions.map(() => ({ value: 'campaign' })), metricValues: spec.metrics.map((key) => ({ value: key.endsWith('Rate') ? '0.25' : '4' })) }],
  }
}
describe('Google report contracts', () => {
  it('rejects measurement IDs, URL injection and invalid hostnames before any request', () => {
    expect(googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: 'G-TEST' })).toBeNull()
    expect(googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: '../123' })).toBeNull()
    expect(googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: '123', GA4_REPORTING_HOSTNAME: 'https://evil.test' })).toBeNull()
    expect(googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: '123' })).toEqual({ propertyId: '123', hostname: 'frequencylocal.com' })
  })
  it('keeps queries bounded to the production hostname, full days and the recommended conversion events', () => {
    const query = googleReportRequest(GOOGLE_DATA_REPORTS[2], 'frequencylocal.com')
    expect(query.limit).toBe('100')
    expect(query.dateRanges[0].endDate).toBe('yesterday')
    expect(JSON.stringify(query.dimensionFilter)).toContain('frequencylocal.com')
    expect(JSON.stringify(query.dimensionFilter)).toContain('generate_lead')
  })
  it('parses real numeric metrics without silently turning missing values into zeros', () => {
    const parsed = parseGoogleReport(GOOGLE_DATA_REPORTS[0], body())
    expect(parsed.rows[0].metrics.sessionKeyEventRate).toBe(0.25)
    const bad = body()
    bad.rows[0].metricValues[0].value = ''
    expect(() => parseGoogleReport(GOOGLE_DATA_REPORTS[0], bad)).toThrow()
    expect(() => parseGoogleReport(GOOGLE_DATA_REPORTS[0], { rows: [] })).toThrow()
  })
  it('treats a schema-valid zero-row report as observed empty, and carries reporting limitations', () => {
    const raw = { ...body(), rows: [], rowCount: 0, metadata: { subjectToThresholding: true, dataLossFromOtherRow: true, samplingMetadatas: [{}] } }
    const parsed = parseGoogleReport(GOOGLE_DATA_REPORTS[0], raw)
    expect(parsed.rows).toEqual([])
    expect(parsed.warnings.join(' ')).toMatch(/thresholding/)
    expect(parsed.warnings.join(' ')).toMatch(/sampled/)
  })
  it('never describes a top-100 subset as a complete total and strips private landing queries', () => {
    const raw = body(1)
    raw.rowCount = 120
    raw.rows[0].dimensionValues[0].value = '/pricing?email=private@example.com'
    const parsed = parseGoogleReport(GOOGLE_DATA_REPORTS[1], raw)
    expect(parsed.rows[0].dimensions.landingPage).toBe('/pricing')
    expect(parsed.warnings.join(' ')).toContain('incomplete')
  })
  it('returns no partial successful reading after a permission or quota failure', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body()))).mockResolvedValueOnce(new Response('{}', { status: 403 }))
    const reading = await readGoogleReports({ propertyId: '123', hostname: 'frequencylocal.com' }, 'private-token', request)
    expect(reading.state).toBe('unavailable')
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][0]).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport')
    expect(request.mock.calls[0][1].redirect).toBe('error')
    const limited = await readGoogleReports({ propertyId: '123', hostname: 'frequencylocal.com' }, 'token', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    expect(limited.state === 'unavailable' && limited.message).toContain('quota')
  })
  it('completes acquisition and bounded user-behavior reports with the same date window', async () => {
    let i = 0
    const request = vi.fn(async () => new Response(JSON.stringify(body(i++))))
    const reading = await readGoogleReports({ propertyId: '123', hostname: 'frequencylocal.com' }, 'token', request)
    expect(reading.state).toBe('available')
    if (reading.state === 'available') expect(reading.reports.map((r) => r.id)).toEqual(['acquisition', 'landing_pages', 'conversions', 'audience_summary', 'user_populations', 'page_activity', 'actions'])
  })
  it('supports a no-dimension audience total without summing overlapping user populations', () => {
    const spec = GOOGLE_DATA_REPORTS.find((r) => String(r.id) === 'audience_summary')
    if (!spec) throw new Error('Missing audience summary report')
    const parsed = parseGoogleReport(spec, { metricHeaders: spec.metrics.map((name) => ({ name })), rowCount: 1, rows: [{ metricValues: spec.metrics.map(() => ({ value: '7' })) }] })
    expect(parsed.rows[0].dimensions).toEqual({})
    expect(parsed.rows[0].metrics.totalUsers).toBe(7)
  })
  it('queries page and action users as distinct per-row observations, never conversion funnels', () => {
    for (const id of ['user_populations', 'page_activity', 'actions']) {
      const spec = GOOGLE_DATA_REPORTS.find((r) => String(r.id) === id)
      if (!spec) throw new Error(`Missing ${id}`)
      const query = googleReportRequest(spec, 'frequencylocal.com')
      expect(query.dateRanges).toEqual([{ startDate: '30daysAgo', endDate: 'yesterday' }])
      expect(query.limit).toBe('100')
      expect(JSON.stringify(query.dimensionFilter)).toContain('frequencylocal.com')
      expect(spec.metrics.some((m) => m === 'activeUsers' || m === 'totalUsers')).toBe(true)
    }
  })
})

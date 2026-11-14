// A portable build specification, not a claim that a remote report has been created.
export const GOOGLE_REPORTING_SPEC = {
  version: 1,
  dataApi: {
    propertyVariable: 'GA4_REPORTING_PROPERTY_ID',
    hostnameVariable: 'GA4_REPORTING_HOSTNAME',
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    permission: 'Viewer on the explicitly selected GA4 property; this is separate from a G- measurement ID.',
    endpoint: 'https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport',
    period: 'Last 30 full days ending yesterday; the private server cache refreshes at most every five minutes.',
    limits: 'Top 100 rows per fixed report. Display truncation, thresholding and sampling warnings; never sum truncated rows as a complete total.',
    setupInspection: {
      enhancedMeasurementEndpoint: 'https://analyticsadmin.googleapis.com/v1alpha/properties/{propertyId}/dataStreams/{streamId}/enhancedMeasurementSettings',
      effectiveHistoryCollection: 'streamEnabled && pageChangesEnabled; GET only. Unsupported or denied API reads retain a manual prerequisite.',
      officialContracts: [
        'https://github.com/googleapis/googleapis/blob/master/google/analytics/admin/v1alpha/analytics_admin.proto',
        'https://github.com/googleapis/googleapis/blob/master/google/analytics/admin/v1alpha/resources.proto',
      ],
    },
  },
  keyEvents: [
    { event: 'sign_up', source: 'First successful account callback with browser identity', counting: 'once per event; first-party idempotency prevents repeat sign-in emission' },
    { event: 'generate_lead', source: 'Verified Create a Space lead capture with consented browser identity', counting: 'once per stored lead; review existing property definitions before activation' },
    { event: 'purchase', source: 'Paid checkout settlement', counting: 'deduplicate by transaction_id' },
  ],
  leadEvent: { event: 'generate_lead', state: 'requires_live_validation', source: 'Server-confirmed Create a Space lead capture, exactly once per stored lead, with consented browser identity. Other lead capture flows need explicit instrumentation. Do not map client-reported builder saves to this key event.' },
  reports: [
    { name: 'Acquisition quality', dimensions: ['sessionSource', 'sessionMedium', 'sessionCampaignName'], metrics: ['sessions', 'engagedSessions', 'keyEvents', 'sessionKeyEventRate'], filter: 'Explicit production hostname; staff and automated traffic exclusion require separate validation' },
    { name: 'Landing pages', dimensions: ['landingPage', 'deviceCategory'], metrics: ['sessions', 'engagedSessions', 'keyEvents'], note: 'Use sanitized page locations without query parameters. Never collect sensitive topic slugs or private query parameters.' },
    { name: 'Campaign conversions', dimensions: ['sessionCampaignName', 'eventName'], metrics: ['eventCount', 'keyEvents', 'purchaseRevenue'], note: 'Filter to sign_up, generate_lead and purchase. Keep event scope and session scope distinct.' },
    { name: 'Audience summary', dimensions: [], metrics: ['totalUsers', 'activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'eventCount'], note: 'Aggregate identities, not verified unique people. Do not sum overlapping population or page rows.' },
    { name: 'New and returning activity', dimensions: ['newVsReturning'], metrics: ['activeUsers', 'totalUsers', 'sessions', 'engagedSessions'], note: 'Users can appear in both populations during the same period.' },
    { name: 'Page activity', dimensions: ['pagePath', 'deviceCategory'], metrics: ['screenPageViews', 'activeUsers', 'userEngagementDuration', 'sessions'], note: 'Sanitized paths; engagement duration is seconds. Rows overlap and do not establish an ordered journey or abandonment.' },
    { name: 'Recorded actions', dimensions: ['eventName'], metrics: ['eventCount', 'totalUsers'], note: 'Repeated events and overlapping users are not conversions. Missing instrumentation cannot establish absence of an action.' },
  ],
  lookerStudio: {
    pages: ['Acquisition and landing pages', 'Campaign leads and first attendance', 'Participation and return', 'Measurement quality'],
    sources: ['GA4 connector', 'Private campaign outcome CSV export, or an approved aggregate warehouse view'],
    freshness: 'Show source timestamps and connector cache age. This is not a realtime operational feed.',
    cost: 'No cost per outcome until verified campaign spend is connected. Unknown spend stays null.',
  },
  validation: [
    'Confirm account, property, web stream, hostname and production measurement ID.',
    'Check consent granted, denied and withdrawn; confirm staff exclusion.',
    'Use DebugView and Measurement Protocol validation; a collection HTTP success alone is not proof of reporting.',
    'Disable Enhanced Measurement browser-history page-view collection before activating the explicit site-wide manual page-view collector. send_page_view:false alone does not override that remote setting. Verify one page_view per navigation and page_view_source=frequency_manual in DebugView.',
    'Verify signup and checkout browser client_id plus session_id continuity through auth and Stripe.',
    'Reconcile a controlled event against first-party facts, accounting for consent and reporting latency.',
    'Create key events and reports only after inspecting existing definitions to avoid duplicates.',
  ],
} as const

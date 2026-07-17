// Google Analytics 4 (gtag.js).
//
// Deliberately inert unless BOTH:
//   • NEXT_PUBLIC_GA_MEASUREMENT_ID is set (the `G-XXXXXXXXXX` from the GA4 property), and
//   • we're running in production (NODE_ENV === 'production').
// So it's safe to ship before the property exists, and it never fires in dev or
// on preview deploys (keeps preview traffic out of your reports).
//
// Privacy: we pass `anonymize_ip` and disable Google's advertising signals
// (`allow_google_signals`/`allow_ad_personalization_signals` off). GA4's
// "Enhanced measurement" auto-tracks client-side route changes, so this single
// snippet covers SPA navigation across the whole app — no manual pageview wiring.
// Disclosed in the privacy policy (see app/privacy/page.tsx) and ADR-048.
//
// STAFF OPT-OUT: an operator working IN the product should not pollute their own
// reports. The head snippet below checks a persisted browser flag
// (`freq-ga-optout`, set by <GaStaffOptOut/> whenever a staff viewer loads) and,
// when present, sets GA's official kill switch `window['ga-disable-<ID>']=true`
// BEFORE the first config call, so not even the initial page_view is sent. The
// flag persists in localStorage, so once an operator has loaded the app on a
// browser, every later load (including the first paint) stays untracked. This is
// browser-scoped by design (client-side), which keeps every page statically
// renderable — no per-request auth read in the root layout.

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export function GoogleAnalytics() {
  if (!GA_ID || process.env.NODE_ENV !== 'production') return null

  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            try{if(localStorage.getItem('freq-ga-optout')==='1'){window['ga-disable-${GA_ID}']=true;}}catch(e){}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', {
              anonymize_ip: true,
              allow_google_signals: false,
              allow_ad_personalization_signals: false
            });
          `,
        }}
      />
    </>
  )
}

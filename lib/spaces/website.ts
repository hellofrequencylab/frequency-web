// THE EXTERNAL WEBSITE PUBLISH FLAG (ADR-508 U4-B). PURE + framework-independent, so it is trivially
// testable and safe to import on the public render path, the metadata resolve, and the manage panel.
//
// A Space's external micro-site (/sites/<slug>) is FAIL-CLOSED: it only renders when the operator has
// explicitly published it, on TOP of the network-visibility gate. This reader answers "is the website
// published?" off the preferences blob. FAIL-SAFE false: an absent / malformed / non-boolean value is
// treated as NOT published, so a bad row keeps the site private rather than leaking it.

/** Is the Space's external website explicitly published? Only a literal `true` at
 *  `preferences.websitePublished` counts; everything else (absent, a truthy string, a malformed blob)
 *  reads as false so the public route 404s by default. */
export function readWebsitePublished(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return false
  return (preferences as Record<string, unknown>).websitePublished === true
}

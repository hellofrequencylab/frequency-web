// FREQUENCY'S DOMAIN CONNECT IDENTITY (LIVE-780). One home for the ids the template, the signer, the
// discovery and the return route all have to agree on. They are also baked into the template file
// (frequencylocal.com.website.json) and, once onboarded, into every DNS provider's copy of it, so
// changing one here means a new template version and a new onboarding round.

/** Who publishes the template: Frequency's own apex, as Domain Connect expects. */
export const DC_PROVIDER_ID = 'frequencylocal.com'

/** Which template: the one that points a domain at a Frequency website. */
export const DC_SERVICE_ID = 'website'

/** The DNS label (under DC_PUB_KEY_DOMAIN) holding the public half of the signing key. Sent as
 *  `key=` on every apply URL, so a provider knows which TXT record to verify the signature with. */
export const DC_KEY_HOST = '_dck1'

/** The domain whose `_dck1` TXT record carries the public key (the template's syncPubKeyDomain). */
export const DC_PUB_KEY_DOMAIN = 'frequencylocal.com'

/** Where the provider sends the owner back after approving (the template's syncRedirectDomain is
 *  frequencylocal.com, so this path must be served on that host). */
export const DC_RETURN_PATH = '/api/sites/domain-connect/return'

/** The env var holding the PEM private key the apply URL is signed with. Absent means one-click is
 *  off and the Domain section shows the copy-records steps. */
export const DC_PRIVATE_KEY_ENV = 'DOMAIN_CONNECT_PRIVATE_KEY'

# Frequency's Domain Connect template (LIVE-780)

Status lives in `docs/BUILD-BACKLOG.json` (row LIVE-780). This file only says how the template gets
out into the world.

`frequencylocal.com.website.json` is the template a DNS provider applies when a Space owner presses
"Connect with <provider>" in the Domain section. It sets two records:

| Type  | Host  | Points to  |
|-------|-------|------------|
| A     | `@`   | `%ip%`     |
| CNAME | `www` | `%target%` |

`ip` and `target` are filled from Vercel's recommended values for the domain (`siteDomainStatus` in
`lib/sites/vercel-domains.ts`), so the template keeps working if Vercel changes them. Because the
template has variables, every apply URL is signed (`signer.ts`), and providers check the signature
against the public key at `_dck1.frequencylocal.com`.

The ids in the file must match `constants.ts`. Changing a record means bumping `version` and
submitting again.

## 1. Make the signing key (once)

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out domain-connect-private.pem
openssl rsa -in domain-connect-private.pem -pubout -outform DER | base64 | tr -d '\n'
```

- Put the whole contents of `domain-connect-private.pem` in the Vercel env var
  `DOMAIN_CONNECT_PRIVATE_KEY` (Production). Do not commit it. Delete the local file after.
- Publish the base64 output of the second command as TXT records at `_dck1.frequencylocal.com`.
  Split it into pieces of 200 characters or fewer, one TXT record each:
  `p=1,a=RS256,d=<first piece>`, `p=2,a=RS256,d=<second piece>`, and so on.
  `publicKeyTxtRecords()` in `signer.ts` produces exactly these values from a public key.

## 2. Submit the template

1. Fork https://github.com/Domain-Connect/Templates.
2. Copy `frequencylocal.com.website.json` into the fork's root, unchanged.
3. Run the repo's linter on it (see that repo's README) and fix anything it reports.
4. Open a pull request titled "Add frequencylocal.com website template".

## 3. Get each provider to onboard it

A merged template does nothing until a provider loads it. Until then the Domain section shows the
copy-records steps, so nothing breaks while waiting.

- Cloudflare: email domain-connect@cloudflare.com with a link to the merged template.
- GoDaddy, IONOS, Vercel and others: contact their Domain Connect or partner teams with the same link.

## Reviewed outbound destinations

Discovery accepts exact GoDaddy bases `https://domainconnect.godaddy.com` and
`https://domainconnect.api.godaddy.com`, paired with API `https://domainconnect.api.godaddy.com`
and browser flow `https://dcc.godaddy.com/manage`. Cloudflare uses API/discovery
`https://api.cloudflare.com/client/v4/dns/domainconnect` paired with browser flow
`https://dash.cloudflare.com/domainconnect`. Returned settings must belong to the discovered
provider, and each server HTTP request revalidates the reviewed destination with redirects disabled.

These mappings follow the [Domain Connect client examples](https://github.com/Domain-Connect/domainconnect_python)
and the [Cloudflare provider settings example](https://mailarchive.ietf.org/arch/msg/dnsop/NOI3OZcEsq25AUBiC7XS1_0rMK8/).
This is an explicit provider trust boundary, not a claim that arbitrary hostname resolution is safe.
IONOS, Squarespace, Vercel and other unreviewed endpoints use the existing copy-records fallback.
Adding a provider requires reviewing its exact discovery, API and browser bases together and extending
the destination behavior tests; template onboarding alone does not expand the outbound allowlist.

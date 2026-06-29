import { permanentRedirect } from 'next/navigation'

// /build is no longer a primary page. The builder narrative is CONTENT, not a
// gate: it now lives on The Community (who's here, the builder story, and the
// safety net so starting one Circle never means doing it alone). This route is
// retired with a permanent (308) redirect so old links and SEO survive.
export default function BuildRedirect() {
  permanentRedirect('/the-community')
}

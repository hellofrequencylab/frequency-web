import { permanentRedirect } from 'next/navigation'

// /spread is no longer a primary page. Taking a role in building community around
// you is part of The Community's builder narrative now, so this route is retired
// with a permanent (308) redirect there. Old links and SEO survive.
export default function SpreadRedirect() {
  permanentRedirect('/the-community')
}

'use client'

import dynamic from 'next/dynamic'

// The Services quote form behind a client-side split point. A client component imported straight from a server module lands in
// the client manifest of every page that imports the block registry, the front door included (check:shell-weight, ARM D), and
// next/dynamic called from a server module does not split it. Called here, inside the client boundary, the form and its field
// primitives become their own chunk that only a page rendering the quote block loads. It still server-renders.
export const ServicesQuoteForm = dynamic(() => import('./services-quote-form').then((m) => m.ServicesQuoteForm))

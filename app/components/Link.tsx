import NextLink from 'next/link'
import type { ComponentProps } from 'react'

// next/link with prefetching off by default. A page view prefetched every link on screen — 16
// background requests on a hadith page, each rendering part of its page with database queries — and
// crawlers that run JavaScript (most of the traffic) cut them off when moving on, which Next logged
// as «The destination stream closed early». Pages render quickly on the server, so links load on
// click; pass prefetch={true} where a link really benefits from it.
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />
}

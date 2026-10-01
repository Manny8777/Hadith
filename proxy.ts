import { NextResponse } from 'next/server'

// The site has no Server Actions, so a request carrying a Next-Action header is a scanner probing for
// them (it filled the logs with «Server Reference ID did not match … Received "x"»). Turn it away
// here, before Next.js tries to resolve the action. The matcher runs this only for such requests.
export function proxy() {
  return new NextResponse(null, { status: 404 })
}

export const config = {
  matcher: [{ source: '/:path*', has: [{ type: 'header', key: 'next-action' }] }],
}

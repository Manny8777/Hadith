import { NextResponse, type NextRequest } from 'next/server'

// The site has no Server Actions, and its pages only answer GET: every form and client posts to
// /api/… or /mcp. Scanners still POST to pages with a Next-Action header (or a multipart / text/plain
// body), which Next tries to resolve as an action and logs «Server Reference ID did not match …
// Received "x"». Answering them here made Next log «Expected RSC response, got text/plain» instead,
// so they are rewritten to a plain 404 route, with the action header removed, and never reach the
// page or action machinery.
export function proxy(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!req.headers.has('next-action')) return NextResponse.next()
  }
  const headers = new Headers(req.headers)
  headers.delete('next-action')
  headers.delete('next-router-state-tree')
  return NextResponse.rewrite(new URL('/api/not-found', req.url), { request: { headers } })
}

export const config = {
  // pages only: not the API and MCP routes (which take POST), Next's assets, or static files
  matcher: ['/((?!api/|mcp|_next/|media/|assets/|fonts/|\\.well-known/).*)'],
}

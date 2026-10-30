// next/server in the offline build: NextResponse is a plain Response.
export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return new Response(JSON.stringify(body), { ...init, headers })
  }
  static redirect(url: string | URL, status = 307) { return Response.redirect(url, status) }
  static next() { return new Response(null) }
}
export type NextRequest = Request & { nextUrl: URL }
export const after = (fn: () => unknown) => { try { void fn() } catch {} }

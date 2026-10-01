// Where proxy.ts sends requests that pages never answer (POSTs to a page, Server Action probes)
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })

export const GET = notFound
export const HEAD = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound

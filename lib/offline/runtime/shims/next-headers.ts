// next/headers in the offline build: no request, so no cookies and no headers.
const empty = { get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {}, toString: () => '' }
export async function cookies() { return empty }
export async function headers() { return new Headers() }
export async function draftMode() { return { isEnabled: false } }

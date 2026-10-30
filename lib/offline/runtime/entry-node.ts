// Node build of the offline app, for tests: render a page to HTML with the device database stand-in.
import { prerenderToNodeStream } from 'react-dom/static'
import { renderToString } from 'react-dom/server'
import { createElement, Fragment } from 'react'
import { renderPage, handleApi } from './core'
export { setOfflineRunner } from './shims/db'
export { withQueryCache, cacheParams, encodeRows } from './cache'

export async function renderPathToHtml(href: string) {
  const u = new URL(href, 'https://hadith.dev')
  const r = await renderPage(u.pathname, u.searchParams)
  if (r.kind !== 'page') return { kind: r.kind, html: '' }
  // prerender waits for Suspense boundaries (lazy client components), as the browser does
  const { prelude } = await prerenderToNodeStream(createElement(Fragment, null, r.node))
  let html = ''
  for await (const c of prelude) html += c
  return { kind: r.kind, title: r.title, html }
}
export async function api(href: string) {
  const res = await handleApi(new URL(href, 'https://hadith.dev'))
  return res ? { status: res.status, body: await res.text() } : null
}

// renderToString, which (like the browser) cannot wait for an async component: the error names it
export async function renderSync(href: string) {
  const u = new URL(href, 'https://hadith.dev')
  const r = await renderPage(u.pathname, u.searchParams)
  if (r.kind !== 'page') return ''
  return renderToString(createElement(Fragment, null, r.node))
}

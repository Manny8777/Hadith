// Builds the offline app: the site's own pages (app/**/page.tsx), layouts and API routes, bundled
// for the browser, with the server-only pieces swapped for offline ones:
//   @/lib/db         → lib/offline/runtime/shims/db.ts (queries go to PGlite on the device)
//   next/navigation, next/link, next/image, next/server, next/headers → lib/offline/runtime/shims/
// Files marked 'use client' get their exports tagged $$client so the offline renderer
// (lib/offline/runtime/resolve.ts) leaves them to React and runs everything else as a server
// component. Output: public/offline/app/ (loaded by the /offline page).
//
//   node scripts/offline/build-offline-app.mjs [--node out.mjs]   (--node: a Node build, for tests)
import { build } from 'esbuild'
import { readFileSync, readdirSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RT = join(ROOT, 'lib', 'offline', 'runtime')
const nodeOut = process.argv.includes('--node') ? process.argv[process.argv.indexOf('--node') + 1] : null

// Pages that only make sense with the server: sign-in, the reader's account and library, admin
const ONLINE_ONLY = /^\/(account|admin|login|library|oauth|mcp)(\/|$)/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// app/hadith/[id]/page.tsx → { path: '/hadith/[id]', regex, keys }
function routeOf(file, leaf) {
  const rel = relative(join(ROOT, 'app'), dirname(file)).split(sep).filter(Boolean).filter(s => !/^\(.*\)$/.test(s))
  const keys = []
  const re = rel.map(seg => {
    const m = seg.match(/^\[(\.\.\.)?(\w+)\]$/)
    if (!m) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    keys.push({ name: m[2], rest: !!m[1] })
    return m[1] ? '(.+)' : '([^/]+)'
  })
  const path = '/' + rel.join('/')
  return { path, keys, regex: '^/' + re.join('/') + '/?$', file, leaf }
}

const files = walk(join(ROOT, 'app'))
const pages = files.filter(f => /[\\/]page\.tsx?$/.test(f)).map(f => routeOf(f, 'page')).filter(r => !ONLINE_ONLY.test(r.path) && !r.path.startsWith('/api'))
const layouts = files.filter(f => /[\\/]layout\.tsx?$/.test(f) && dirname(f) !== join(ROOT, 'app')).map(f => routeOf(f, 'layout'))
const apis = files.filter(f => /[\\/]api[\\/].*route\.ts$/.test(f)).map(f => routeOf(f, 'api'))
  .filter(r => !/^\/api\/(account|admin|auth|library|oauth|track|chain-share)(\/|$)/.test(r.path))

// More specific routes first: static segments beat dynamic ones
const score = r => r.path.split('/').map(s => (s.startsWith('[') ? (s.startsWith('[...') ? 0 : 1) : 2))
const byScore = (a, b) => {
  const sa = score(a), sb = score(b)
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) if ((sa[i] ?? -1) !== (sb[i] ?? -1)) return (sb[i] ?? -1) - (sa[i] ?? -1)
  return 0
}
pages.sort(byScore); apis.sort(byScore)

const imp = f => JSON.stringify(f.split(sep).join('/'))
const routesModule = `
export const pages = [${pages.map(r => `{ path: ${JSON.stringify(r.path)}, re: new RegExp(${JSON.stringify(r.regex)}), keys: ${JSON.stringify(r.keys)}, load: () => import(${imp(r.file)}),
  layouts: [${layouts.filter(l => r.path === l.path || r.path.startsWith(l.path + '/')).sort((a, b) => a.path.length - b.path.length).map(l => `() => import(${imp(l.file)})`).join(', ')}] }`).join(',\n')}]
export const apis = [${apis.map(r => `{ path: ${JSON.stringify(r.path)}, re: new RegExp(${JSON.stringify(r.regex)}), keys: ${JSON.stringify(r.keys)}, load: () => import(${imp(r.file)}) }`).join(',\n')}]
`

const shim = n => join(RT, 'shims', n)
const aliases = {
  '@/lib/db': shim('db.ts'),
  'next/navigation': shim('next-navigation.ts'),
  'next/link': shim('next-link.tsx'),
  'next/image': shim('next-image.tsx'),
  'next/server': shim('next-server.ts'),
  'next/headers': shim('next-headers.ts'),
}

const offlinePlugin = {
  name: 'offline',
  setup(b) {
    b.onResolve({ filter: /^offline-routes$/ }, () => ({ path: 'offline-routes', namespace: 'offline' }))
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: routesModule, loader: 'js', resolveDir: ROOT }))
    b.onResolve({ filter: /^(@\/lib\/db|next\/(navigation|link|image|server|headers))$/ }, a => ({ path: aliases[a.path] }))
    b.onResolve({ filter: /^@\// }, async a => b.resolve('./' + a.path.slice(2), { resolveDir: ROOT, kind: a.kind }))
    b.onResolve({ filter: /^\/offline\// }, a => ({ path: a.path, external: true }))
    // The Node test build has no use for stylesheets
    if (nodeOut) b.onResolve({ filter: /\.css$/ }, () => ({ path: 'empty', namespace: 'empty' }))
    // Server-only modules some shared files import (account features, not used offline)
    b.onResolve({ filter: /^(pg|server-only|node:crypto|crypto)$/ }, () => ({ path: 'empty', namespace: 'empty' }))
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({
      contents: `const off = () => { throw new Error('not available offline') }
        export default {}; export const Pool = class {}; export const randomBytes = off; export const createHash = off
        export const createHmac = off; export const timingSafeEqual = off; export const randomUUID = () => crypto.randomUUID()`,
      loader: 'js',
    }))
    // 'use client' files: tag their exports so the renderer hands them to React
    b.onLoad({ filter: /[\\/](app|lib)[\\/].*\.tsx?$/ }, a => {
      const src = readFileSync(a.path, 'utf8')
      if (!/^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src)) return null
      const names = new Set()
      for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g)) names.add(m[1])
      for (const m of src.matchAll(/export\s+const\s+(\w+)/g)) names.add(m[1])
      for (const m of src.matchAll(/export\s+default\s+(\w+)\s*;?\s*$/gm)) if (m[1] !== 'function') names.add(m[1])
      for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) for (const n of m[1].split(',')) { const id = n.trim().split(/\s+as\s+/)[0]; if (/^\w+$/.test(id)) names.add(id) }
      const tag = [...names].map(n => `try { if (typeof ${n} === 'function' || (${n} && typeof ${n} === 'object')) ${n}.$$client = true } catch {}`).join('\n')
      return { contents: src + '\n' + tag + '\n', loader: a.path.endsWith('x') ? 'tsx' : 'ts' }
    })
  },
}

const common = {
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  target: 'es2022',
  plugins: [offlinePlugin],
  loader: { '.css': 'css', '.svg': 'file', '.png': 'file', '.woff2': 'file' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SITE_URL': '"https://hadith.dev"',
    'process.env.SITE_URL': '"https://hadith.dev"',
  },
  logLevel: 'warning',
  legalComments: 'none',
}

if (nodeOut) {
  await build({ ...common, entryPoints: [join(RT, 'entry-node.ts')], outfile: nodeOut, platform: 'node', splitting: false, packages: 'external', external: ['@electric-sql/*'] })
} else {
  const outdir = join(ROOT, 'public', 'offline', 'app')
  rmSync(outdir, { recursive: true, force: true })
  const r = await build({ ...common, entryPoints: { app: join(RT, 'entry-browser.tsx') }, outdir, platform: 'browser', splitting: true, minify: true, metafile: true, chunkNames: 'c/[name]-[hash]', assetNames: 'a/[name]-[hash]', publicPath: '/offline/app/', define: { ...common.define, 'process.env': '{}' } })
  // The list the service worker caches for opening without a connection (public/sw.js)
  const files = Object.keys(r.metafile.outputs).map(f => '/offline/app/' + relative(outdir, join(ROOT, f)).split(sep).join('/'))
  writeFileSync(join(outdir, 'files.json'), JSON.stringify(files))
}
console.log(`offline app: ${pages.length} pages, ${apis.length} API routes`)

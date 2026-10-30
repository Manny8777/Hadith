// The offline database's files (manifest.json and the gzip chunks), for the installed app's
// «تحميل للعمل دون إنترنت». They live outside the app (by default a GitHub release of this repo,
// whose downloads browsers cannot fetch directly: no CORS headers), so they are passed through here.
// OFFLINE_DATA_URL points elsewhere (a CDN or bucket) when set; scripts/offline/README.md has the steps.

export const dynamic = 'force-dynamic'

const SOURCE = (process.env.OFFLINE_DATA_URL || 'https://github.com/Manny8777/Hadith/releases/download/offline-pg').replace(/\/+$/, '')
const NAME = /^(manifest\.json|aljami-[\w.-]+\.part\d{3}\.gz)$/

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  if (!NAME.test(name)) return new Response('Not found', { status: 404 })

  let upstream: Response
  try {
    upstream = await fetch(`${SOURCE}/${name}`, { cache: 'no-store', redirect: 'follow' })
  } catch {
    return new Response('Upstream unavailable', { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.status === 404 ? 'Not found' : 'Upstream error', { status: upstream.status === 404 ? 404 : 502 })
  }

  const isManifest = name === 'manifest.json'
  const headers = new Headers({
    'Content-Type': isManifest ? 'application/json; charset=utf-8' : 'application/gzip',
    // Chunk names carry the edition, so a chunk never changes; the manifest says which edition is current
    'Cache-Control': isManifest ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  return new Response(upstream.body, { status: 200, headers })
}

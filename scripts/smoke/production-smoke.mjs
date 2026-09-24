#!/usr/bin/env node

const baseUrl = (process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '30000', 10)
const checks = [
  { path: '/api/health', type: 'json', validate: body => body.status === 'ok' && body.database === 'reachable' },
  { path: '/', type: 'html', validate: body => body.includes('جامع خادم الحرمين') },
  { path: '/api/books', type: 'json', validate: Array.isArray },
  { path: '/api/search?q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&limit=1', type: 'json', validate: body => Array.isArray(body.results) },
  { path: '/hadith/5', type: 'html', validate: body => body.includes('hadith-matn') },
  { path: '/api/hadith/5/takhrij', type: 'json', validate: Array.isArray },
  { path: '/hadith/5/across-books', type: 'html', validate: body => body.includes('الحديث في كتب الحديث') },
  { path: '/hadith/5/witnesses', type: 'html', validate: body => body.includes('الشواهد والمتابعات') },
  { path: '/narrator/9', type: 'html', validate: body => body.includes('أبان بن إسحاق') },
  { path: '/topics', type: 'html', validate: body => body.includes('الفهارس الموضوعية') || body.includes('الموضوع') },
  { path: '/topics/item/759?view=hadiths', type: 'html', validate: body => body.includes('الأحاديث المرتبطة مباشرة') },
  { path: '/api/topics/item/759?view=hadiths', type: 'json', validate: body => body.mode === 'hadiths' && body.hadiths.length > 0 },
  { path: '/service-content/297408', type: 'html', validate: body => body.includes('الحواشي') || body.includes('بسم الله') || body.includes('بِسْمِ') },
  { path: '/hadiths/amthal', type: 'html', validate: body => body.includes('أمثال الحديث النبوي') },
  { path: '/hadiths/services-index', type: 'html', validate: body => body.includes('hadith_services') },
  { path: '/hadiths/takhrij-spread?minBooks=3', type: 'html', validate: body => body.includes('الأحاديث المنتشرة عبر الكتب') },
  { path: '/takhrij?q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9', type: 'html', validate: body => body.includes('محرك التخريج') },
]

let failed = 0
console.log(`Smoke testing ${baseUrl}`)

for (const check of checks) {
  const startedAt = Date.now()
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: { 'user-agent': 'HadithRailwaySmoke/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const elapsed = Date.now() - startedAt
    const body = await response.text()
    const contentType = response.headers.get('content-type') || ''
    const typeOk = check.type === 'json'
      ? contentType.includes('application/json')
      : contentType.includes('text/html')

    if (!response.ok || !typeOk) {
      throw new Error(`HTTP ${response.status}; content-type=${contentType || 'missing'}`)
    }
    if (check.validate) {
      const parsed = check.type === 'json' ? JSON.parse(body) : body
      if (!check.validate(parsed)) throw new Error('response content check failed')
    }

    console.log(`PASS  ${String(elapsed).padStart(6)}ms  ${check.path}`)
  } catch (error) {
    failed++
    const message = error instanceof Error ? error.message : String(error)
    console.error(`FAIL          ${check.path}  ${message}`)
  }
}

if (failed > 0) {
  console.error(`
${failed} smoke check(s) failed.`)
  process.exit(1)
}

console.log(`
All ${checks.length} smoke checks passed.`)

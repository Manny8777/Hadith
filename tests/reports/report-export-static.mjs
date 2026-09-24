import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

const [layout, styles, narratorExport, topicExport, printButton, downloader] = await Promise.all([
  read('app/layout.tsx'),
  read('app/globals.css'),
  read('app/components/NarratorExport.tsx'),
  read('app/components/TopicExport.tsx'),
  read('app/components/ReportPrintButton.tsx'),
  read('lib/downloadTextFile.ts'),
])

assert.match(layout, /id="report-print-root"/, 'The shared print portal must exist in the root layout')
assert.doesNotMatch(layout, /report-print-root[^>]*aria-hidden/, 'The report portal must not be hidden from assistive technology')
assert.match(styles, /\.report-print-root\s*\{[\s\S]*?display:\s*none/, 'The print portal must stay hidden on screen')
assert.match(styles, /body\.report-print-active\s*>\s*:not\(\.report-print-root\)/, 'Print mode must hide the application shell')
assert.match(styles, /\.report-print-text\s*\{[\s\S]*?white-space:\s*pre-wrap[\s\S]*?overflow-wrap:\s*anywhere/, 'Printed reports must preserve line breaks and wrap long RTL text')

for (const [name, source] of [['NarratorExport', narratorExport], ['TopicExport', topicExport]]) {
  assert.match(source, /downloadUtf8TextFile/, `${name} must create a real text download`)
  assert.match(source, /ReportPrintButton/, `${name} must expose a dedicated print action`)
  assert.match(source, /role="status"/, `${name} must announce export status`)
  assert.match(source, /aria-live="polite"/, `${name} must use polite live status`)
  assert.match(source, /aria-busy=/, `${name} must expose busy state`)
  assert.match(source, /min-h-11/, `${name} must provide 44px-friendly action targets`)
}

assert.match(downloader, /text\/plain;charset=utf-8/, 'TXT downloads must be UTF-8')
assert.match(downloader, /\\uFEFF/, 'TXT downloads must include a UTF-8 BOM for Windows text editors')
assert.match(downloader, /\.txt/, 'Downloads must use the TXT extension')
assert.match(narratorExport, /حدود التقرير/, 'Narrator reports must disclose their bounded scope')
assert.match(narratorExport, /تقتصر قوائم الشيوخ والتلاميذ على ما هو محمّل في هذه الصفحة/, 'Narrator report must not imply complete relationship lists')
assert.match(topicExport, /const EXPORT_PAGE_LIMIT = 200/, 'Topic reports must retain the 200-row safety cap')
assert.match(topicExport, /const EXPORT_REQUEST_TIMEOUT_MS = 15_000/, 'Topic export requests must have a bounded client timeout')
assert.match(topicExport, /new AbortController\(\)/, 'Topic export requests must be abortable')
assert.match(topicExport, /signal: controller\.signal/, 'Topic export requests must pass the abort signal to fetch')
assert.match(topicExport, /window\.clearTimeout\(timeoutId\)/, 'Topic export requests must clear their timeout')
assert.match(topicExport, /if \(!res\.ok\)/, 'Topic reports must check response.ok')
assert.match(topicExport, /if \(hadiths\.length === 0\)/, 'Topic reports must handle empty responses')
assert.match(topicExport, /data\.truncated/, 'Topic reports must surface truncation')
assert.match(topicExport, /unresolved_associations/, 'Topic reports must surface unresolved counts')
assert.match(topicExport, /هذه القائمة ليست كاملة/, 'Bounded topic reports must explicitly warn that they are incomplete')
assert.match(topicExport, /pagination\.next_offset/, 'Topic reports must validate pagination metadata')
assert.ok(
  topicExport.indexOf('if (!res.ok)') < topicExport.indexOf('const loaded = await loadBoundedReport()'),
  'Topic response.ok must be checked before any action consumes the response',
)
assert.match(printButton, /window\.print\(\)/, 'The print action must invoke the browser print dialog')
assert.match(printButton, /createPortal/, 'The report must render into the isolated print portal')
assert.match(printButton, /data-report-print-article/, 'The report must render as an isolated print document')

console.log('Report export static checks passed.')

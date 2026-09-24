import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const route = await readFile(
  path.join(root, 'app/api/topics/item/[id]/export/route.ts'),
  'utf8',
)
const component = await readFile(
  path.join(root, 'app/components/TopicExport.tsx'),
  'utf8',
)

assert.match(
  route,
  /SELECT DISTINCT subject_id, paragraph_main_id\s+FROM hadith_subjects\s+WHERE subject_id = \$1/,
  'topic export must deduplicate (subject_id, paragraph_main_id) before joining',
)
assert.match(
  route,
  /JOIN hadith_toc h ON h\.main_id = hs\.paragraph_main_id/,
  'topic export must resolve hadith_subjects.paragraph_main_id through hadith_toc.main_id',
)
assert.doesNotMatch(
  route,
  /hs\.hadith_id/,
  'topic export must not reference the nonexistent hadith_subjects.hadith_id column',
)
assert.match(
  route,
  /ORDER BY h\.book_id ASC, h\.main_id ASC/,
  'topic export must preserve stable book/main ordering',
)
assert.match(route, /const MAX_EXPORT_LIMIT = 200/)
assert.match(route, /const DEFAULT_EXPORT_LIMIT = 200/)
assert.match(
  route,
  /const MAX_DATABASE_INTEGER = 2_147_483_647/,
  'topic IDs must be bounded to the database integer range',
)
assert.match(
  route,
  /parsed <= MAX_DATABASE_INTEGER/,
  'topic ID validation must reject values outside the database integer range',
)
assert.match(route, /LIMIT \$2 OFFSET \$3/)
assert.match(
  route,
  /const requestedOffset = offsetParam === null \? 0 : parseIntegerParam\(offsetParam\)/,
  'missing offsets must use the zero default while explicit offsets are validated',
)
assert.match(
  route,
  /requestedLimit === null \|\| requestedLimit < 1 \|\| requestedOffset === null/,
  'invalid or empty pagination must be rejected before querying',
)
assert.match(
  route,
  /const limit = Math\.min\(requestedLimit, MAX_EXPORT_LIMIT\)/,
  'requested export limits must remain bounded by the safety cap',
)
assert.match(
  route,
  /returnedRows !== expectedReturnedRows/,
  'returned rows must agree with the independent count and requested page',
)

for (const field of [
  'distinct_linked_associations',
  'exportable_resolved_rows',
  'returned_rows',
  'unresolved_associations',
  'truncated',
  'pagination',
]) {
  assert.ok(route.includes(field), `topic export response is missing ${field}`)
}
assert.match(
  route,
  /const hasMore = offset \+ returnedRows < exportableResolvedRows/,
  'truncation must use the independently counted exportable total',
)
assert.match(route, /has_more: hasMore/)
assert.match(route, /next_offset: hasMore \? offset \+ returnedRows : null/)
assert.doesNotMatch(
  route,
  /truncated:\s*hadiths\.length\s*===\s*200/,
  'truncation must not be inferred from the returned array length alone',
)

assert.match(route, /if \(itemId === null\)[\s\S]*status: 400/)
assert.match(route, /if \(!itemRes\.rows\[0\]\)[\s\S]*status: 404/)
assert.match(route, /catch \{[\s\S]*status: 500/)

const responseCheck = component.indexOf('if (!res.ok)')
const emptyGuard = component.indexOf('if (hadiths.length === 0)')
const metadataCheck = component.indexOf('!numberAtLeast(data.exportable_resolved_rows, 0)')
const copyCall = component.indexOf('navigator.clipboard.writeText(text)')
assert.ok(responseCheck >= 0, 'TopicExport must check response.ok before copying')
assert.ok(emptyGuard >= 0, 'TopicExport must guard against empty exports')
assert.ok(copyCall >= 0, 'TopicExport must retain the existing clipboard workflow')
assert.ok(responseCheck < copyCall, 'TopicExport must check response.ok before copying')
assert.ok(emptyGuard < copyCall, 'TopicExport must reject empty exports before copying')
assert.ok(metadataCheck >= 0)
assert.ok(metadataCheck < copyCall, 'TopicExport must validate export metadata before copying')
assert.ok(
  component.includes("row.part_num === null || typeof row.part_num === 'number'"),
  'TopicExport must accept nullable TOC part numbers',
)
assert.ok(
  component.includes("row.page_num === null || typeof row.page_num === 'number'"),
  'TopicExport must accept nullable TOC page numbers',
)
assert.ok(component.includes('data.truncated'), 'TopicExport must surface server-reported truncation')
assert.ok(
  component.includes('data.truncated !== (data.returned_rows < data.exportable_resolved_rows)'),
  'TopicExport must reject inconsistent truncation metadata before copying',
)
assert.ok(
  component.includes('data.returned_rows > EXPORT_PAGE_LIMIT'),
  'TopicExport must reject responses that exceed the requested safety cap',
)
assert.ok(component.includes('تعذر تصدير المصادر الآن. لم يتم نسخ أي محتوى.'))
assert.ok(component.includes('لا توجد مصادر قابلة للتصدير'))
assert.match(
  component,
  /!data \|\|\s+typeof data !== 'object' \|\|\s+Array\.isArray\(data\)[\s\S]*!Array\.isArray\(data\.hadiths\)[\s\S]*return/,
  'TopicExport must not replace malformed API data with an empty list',
)

console.log('Topic export safety checks passed.')

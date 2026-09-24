import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// Load the actual TypeScript helper without requiring a new test runner or changing package.json.
// The repository already uses TypeScript, and Node 20.9 (the declared minimum) can dynamically
// import JavaScript from a data URL after the dependency-free in-process transpilation.
const helperSource = await readFile(new URL('../lib/urlState.ts', import.meta.url), 'utf8')
const helperJavaScript = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const helperModule = await import(
  `data:text/javascript;base64,${Buffer.from(helperJavaScript).toString('base64')}`
)
const {
  buildSearchApiUrl,
  buildSearchUrl,
  buildTopicUrl,
  parsePositivePage,
  parseSearchUrl,
  parseTopicUrl,
} = helperModule

test('parsePositivePage safely defaults malformed values to page 1', () => {
  for (const value of [null, '', 'abc', '0', '-2', '1.5', '1e3', ' 2x', '999999999999999999999']) {
    assert.equal(parsePositivePage(value), 1)
  }
  assert.equal(parsePositivePage(' 2 '), 2)
  assert.equal(parsePositivePage('003'), 3)
})

test('parseSearchUrl reads supported state and normalizes defaults', () => {
  const state = parseSearchUrl([
    'q=الصلاة',
    'book_id=7',
    'grade=SAHIH',
    'subject_cat_id=3',
    'max_depth=4',
    'search_scope=tarf',
    'match=any',
    'src=service',
    'narrator_id=12',
    'narrator_name=عمر',
    'page=5',
  ].join('&'))

  assert.deepEqual(state, {
    q: 'الصلاة',
    bookId: '7',
    grade: 'sahih',
    subjectCatId: '3',
    maxDepth: '4',
    searchScope: 'tarf',
    matchMode: 'any',
    bookSource: 'service',
    narratorId: '12',
    narratorName: 'عمر',
    page: 5,
  })
})

test('buildSearchUrl omits defaults and preserves unrelated params', () => {
  const input = 'q=الصلاة&search_scope=both&match=phrase&src=hadith&page=1&future=kept'
  assert.equal(buildSearchUrl(input), '/search?q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&future=kept')
})

test('search query/filter changes reset page while page changes preserve filters', () => {
  const input = 'q=old&book_id=7&grade=hasan&search_scope=tarf&match=all&page=4&future=kept'

  const filtered = buildSearchUrl(input, { bookId: '9' })
  assert.equal(
    filtered,
    '/search?q=old&book_id=9&grade=hasan&search_scope=tarf&match=all&future=kept'
  )

  const queried = buildSearchUrl(input, { q: 'new' })
  assert.equal(
    queried,
    '/search?q=new&book_id=7&grade=hasan&search_scope=tarf&match=all&future=kept'
  )

  assert.equal(
    buildSearchUrl(input, { page: 2 }),
    '/search?q=old&book_id=7&grade=hasan&search_scope=tarf&match=all&page=2&future=kept'
  )
})

test('global search q-only patch preserves every existing search filter', () => {
  const input = [
    'q=old',
    'book_id=4',
    'grade=daif',
    'subject_cat_id=2',
    'max_depth=3',
    'search_scope=tarf',
    'match=any',
    'src=service',
    'narrator_id=9',
    'narrator_name=أبو بكرة',
    'page=8',
  ].join('&')

  const url = new URL(buildSearchUrl(input, { q: 'new' }), 'https://example.test')
  assert.equal(url.searchParams.get('q'), 'new')
  for (const [key, expected] of [
    ['book_id', '4'],
    ['grade', 'daif'],
    ['subject_cat_id', '2'],
    ['max_depth', '3'],
    ['search_scope', 'tarf'],
    ['match', 'any'],
    ['src', 'service'],
    ['narrator_id', '9'],
    ['narrator_name', 'أبو بكرة'],
  ]) assert.equal(url.searchParams.get(key), expected)
  assert.equal(url.searchParams.get('page'), null, 'query change resets page')
})

test('search API URLs preserve current mode semantics and parameters', () => {
  const text = buildSearchApiUrl(parseSearchUrl('q=الصلاة&book_id=7&grade=sahih&subject_cat_id=2&max_depth=4&search_scope=tarf&match=all&page=3'))
  const textParams = new URLSearchParams(text.slice(text.indexOf('?')))
  assert.equal(text, '/api/search?q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&page=3&search_scope=tarf&match=all&book_id=7&grade=sahih&subject_cat_id=2&max_depth=4')
  assert.equal(textParams.get('q'), 'الصلاة')

  const service = new URLSearchParams(buildSearchApiUrl(parseSearchUrl('q=تراجم&src=service&grade=sahih&page=2')).split('?')[1])
  assert.equal(service.get('src'), 'service')
  assert.equal(service.get('grade'), null)

  const narratorOnly = new URLSearchParams(buildSearchApiUrl(parseSearchUrl('narrator_id=8&page=4&search_scope=tarf')).split('?')[1])
  assert.equal(narratorOnly.get('narrator_id'), '8')
  assert.equal(narratorOnly.get('page'), '4')
  assert.equal(narratorOnly.get('search_scope'), null)

  const narratorText = new URLSearchParams(buildSearchApiUrl(parseSearchUrl('narrator_id=8&q= الصلاة &grade=daif&search_scope=tarf&match=any')).split('?')[1])
  assert.equal(narratorText.get('q'), 'الصلاة')
  assert.equal(narratorText.get('grade'), 'daif')
  assert.equal(narratorText.get('search_scope'), 'tarf')
  assert.equal(narratorText.get('match'), 'any')
})

test('topic state parses malformed pages and default/invalid views safely', () => {
  assert.deepEqual(parseTopicUrl('page=-5&view=unknown&grade=&q='), {
    page: 1,
    grade: '',
    q: '',
    view: 'children',
  })
  assert.deepEqual(parseTopicUrl('page=2&view=hadiths&grade=hasan&q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9'), {
    page: 2,
    grade: 'hasan',
    q: 'الصلاة',
    view: 'hadiths',
  })
})

test('topic view, grade, query, and clear URLs reset pagination and preserve state', () => {
  const input = 'page=4&view=hadiths&grade=hasan&q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&future=kept'

  assert.equal(
    buildTopicUrl(10, input, { view: 'children' }),
    '/topics/item/10?grade=hasan&q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&future=kept'
  )
  assert.equal(
    buildTopicUrl(10, input, { grade: 'sahih' }),
    '/topics/item/10?grade=sahih&q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&view=hadiths&future=kept'
  )
  assert.equal(
    buildTopicUrl(10, input, { q: '' }),
    '/topics/item/10?grade=hasan&view=hadiths&future=kept'
  )
})

test('topic pagination preserves view, grade, and query', () => {
  const input = 'page=4&view=hadiths&grade=daif&q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&future=kept'
  assert.equal(
    buildTopicUrl(10, input, { page: 2 }),
    '/topics/item/10?page=2&grade=daif&q=%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9&view=hadiths&future=kept'
  )
})
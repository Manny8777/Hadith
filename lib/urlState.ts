export type SearchScope = 'both' | 'tarf'
export type MatchMode = 'phrase' | 'all' | 'any'
export type BookSource = 'hadith' | 'service'
export type SearchGrade = 'sahih' | 'hasan' | 'daif' | ''

export interface SearchUrlState {
  q: string
  bookId: string
  grade: SearchGrade
  subjectCatId: string
  maxDepth: string
  searchScope: SearchScope
  matchMode: MatchMode
  bookSource: BookSource
  narratorId: string
  narratorName: string
  page: number
}

export type SearchUrlPatch = Partial<SearchUrlState>

const SEARCH_PARAM_NAMES: Record<keyof SearchUrlState, string> = {
  q: 'q',
  bookId: 'book_id',
  grade: 'grade',
  subjectCatId: 'subject_cat_id',
  maxDepth: 'max_depth',
  searchScope: 'search_scope',
  matchMode: 'match',
  bookSource: 'src',
  narratorId: 'narrator_id',
  narratorName: 'narrator_name',
  page: 'page',
}

const SEARCH_PARAM_KEYS = new Set(Object.values(SEARCH_PARAM_NAMES))

type QueryInput = URLSearchParams | string

function toSearchParams(input: QueryInput): URLSearchParams {
  return input instanceof URLSearchParams ? new URLSearchParams(input.toString()) : new URLSearchParams(input)
}

/** Strict positive-integer parsing: malformed, fractional, zero, and negative values become page 1. */
export function parsePositivePage(raw: string | null | undefined): number {
  const value = (raw ?? '').trim()
  if (!/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function normalizeSearchGrade(raw: string | null | undefined): SearchGrade {
  const value = (raw ?? '').trim().toLowerCase()
  return value === 'sahih' || value === 'hasan' || value === 'daif' ? value : ''
}

function normalizeMatchMode(raw: string | null | undefined): MatchMode {
  const value = (raw ?? '').trim().toLowerCase()
  return value === 'all' || value === 'any' ? value : 'phrase'
}

function normalizeSearchState(state: SearchUrlState): SearchUrlState {
  return {
    q: state.q.trim(),
    bookId: state.bookId.trim(),
    grade: normalizeSearchGrade(state.grade),
    subjectCatId: state.subjectCatId.trim(),
    maxDepth: state.maxDepth.trim(),
    searchScope: state.searchScope === 'tarf' ? 'tarf' : 'both',
    matchMode: normalizeMatchMode(state.matchMode),
    bookSource: state.bookSource === 'service' ? 'service' : 'hadith',
    narratorId: state.narratorId.trim(),
    narratorName: state.narratorName.trim(),
    page: parsePositivePage(String(state.page)),
  }
}

/** Read all search state from the URL, applying the same defaults as the search API/UI. */
export function parseSearchUrl(input: QueryInput): SearchUrlState {
  const params = toSearchParams(input)
  return normalizeSearchState({
    q: params.get('q') ?? '',
    bookId: params.get('book_id') ?? '',
    grade: normalizeSearchGrade(params.get('grade')),
    subjectCatId: params.get('subject_cat_id') ?? '',
    maxDepth: params.get('max_depth') ?? '',
    searchScope: (params.get('search_scope') ?? '').trim().toLowerCase() === 'tarf' ? 'tarf' : 'both',
    matchMode: normalizeMatchMode(params.get('match')),
    bookSource: (params.get('src') ?? '').trim().toLowerCase() === 'service' ? 'service' : 'hadith',
    narratorId: params.get('narrator_id') ?? '',
    narratorName: params.get('narrator_name') ?? '',
    page: parsePositivePage(params.get('page')),
  })
}

function setOptionalParam(params: URLSearchParams, name: string, value: string) {
  if (value) params.set(name, value)
}

/**
 * Build a canonical `/search` URL while preserving unrelated query parameters.
 * Any query/filter patch resets pagination to page 1 unless `page` is explicitly patched.
 */
export function buildSearchUrl(input: QueryInput, patch: SearchUrlPatch = {}): string {
  const base = toSearchParams(input)
  const current = parseSearchUrl(base)
  const explicitlyPatchesPage = Object.prototype.hasOwnProperty.call(patch, 'page')
  const changesSearch = Object.keys(patch).some(key => key !== 'page')
  const next = normalizeSearchState({
    ...current,
    ...patch,
    page: changesSearch && !explicitlyPatchesPage ? 1 : patch.page ?? current.page,
  })

  const params = new URLSearchParams()
  setOptionalParam(params, SEARCH_PARAM_NAMES.q, next.q)
  setOptionalParam(params, SEARCH_PARAM_NAMES.bookId, next.bookId)
  setOptionalParam(params, SEARCH_PARAM_NAMES.grade, next.grade)
  setOptionalParam(params, SEARCH_PARAM_NAMES.subjectCatId, next.subjectCatId)
  setOptionalParam(params, SEARCH_PARAM_NAMES.maxDepth, next.maxDepth)
    if (next.searchScope !== 'both') params.set(SEARCH_PARAM_NAMES.searchScope, next.searchScope)
    if (next.matchMode !== 'phrase') params.set(SEARCH_PARAM_NAMES.matchMode, next.matchMode)
    if (next.bookSource === 'service') params.set(SEARCH_PARAM_NAMES.bookSource, next.bookSource)
  setOptionalParam(params, SEARCH_PARAM_NAMES.narratorId, next.narratorId)
  setOptionalParam(params, SEARCH_PARAM_NAMES.narratorName, next.narratorName)
  if (next.page !== 1) params.set(SEARCH_PARAM_NAMES.page, String(next.page))

  // Keep forward-compatible parameters without allowing duplicate known values.
  for (const [name, value] of base.entries()) {
    if (!SEARCH_PARAM_KEYS.has(name)) params.append(name, value)
  }

  const query = params.toString()
  return `/search${query ? `?${query}` : ''}`
}

/** Build the API request from the same canonical state used by the page URL. */
export function buildSearchApiUrl(stateInput: SearchUrlState): string {
  const state = normalizeSearchState(stateInput)
  const params = new URLSearchParams()
  const query = state.q.trim()

  if (state.narratorId) {
    params.set('narrator_id', state.narratorId)
    if (query.length >= 2) {
      params.set('q', query)
      params.set('page', String(state.page))
      params.set('search_scope', state.searchScope)
      if (state.matchMode !== 'phrase') params.set('match', state.matchMode)
      if (state.grade) params.set('grade', state.grade)
    } else {
      params.set('page', String(state.page))
      if (state.grade) params.set('grade', state.grade)
    }
    return `/api/search?${params.toString()}`
  }

  params.set('q', query)
  params.set('page', String(state.page))
  params.set('search_scope', state.searchScope)
  if (state.matchMode !== 'phrase') params.set('match', state.matchMode)
  if (state.bookSource === 'service') params.set('src', 'service')
  if (state.bookId) params.set('book_id', state.bookId)
  if (state.bookSource === 'hadith') {
    if (state.grade) params.set('grade', state.grade)
    if (state.subjectCatId) params.set('subject_cat_id', state.subjectCatId)
    if (state.maxDepth) params.set('max_depth', state.maxDepth)
  }
  return `/api/search?${params.toString()}`
}

export type TopicView = 'children' | 'hadiths'

export interface TopicUrlState {
  page: number
  grade: SearchGrade
  q: string
  view: TopicView
}

export interface TopicUrlPatch {
  page?: number | null
  grade?: SearchGrade | null
  q?: string | null
  /** null selects the default children view and omits `view=children` from the URL. */
  view?: TopicView | null
}

const TOPIC_PARAM_NAMES: Record<keyof TopicUrlState, string> = {
  page: 'page',
  grade: 'grade',
  q: 'q',
  view: 'view',
}

const TOPIC_PARAM_KEYS = new Set(Object.values(TOPIC_PARAM_NAMES))

/** Parse topic state defensively so a malformed page never reaches SQL as NaN. */
export function parseTopicUrl(input: QueryInput): TopicUrlState {
  const params = toSearchParams(input)
  return {
    page: parsePositivePage(params.get('page')),
    grade: normalizeSearchGrade(params.get('grade')),
    q: (params.get('q') ?? '').trim(),
    view: params.get('view') === 'hadiths' ? 'hadiths' : 'children',
  }
}

/**
 * Build a topic URL centrally. View/grade/query changes reset page 1; page-only changes
 * preserve grade, query, and view.
 */
export function buildTopicUrl(itemId: number, input: QueryInput, patch: TopicUrlPatch = {}): string {
  const base = toSearchParams(input)
  const current = parseTopicUrl(base)
  const explicitlyPatchesPage = Object.prototype.hasOwnProperty.call(patch, 'page')
  const changesTopic = Object.keys(patch).some(key => key !== 'page')
  const explicitlyPatchesGrade = Object.prototype.hasOwnProperty.call(patch, 'grade')
  const explicitlyPatchesQuery = Object.prototype.hasOwnProperty.call(patch, 'q')
  const explicitlyPatchesView = Object.prototype.hasOwnProperty.call(patch, 'view')
  const next: TopicUrlState = {
    page: changesTopic && !explicitlyPatchesPage ? 1 : patch.page ?? current.page,
    grade: explicitlyPatchesGrade ? patch.grade ?? '' : current.grade,
    q: explicitlyPatchesQuery ? patch.q ?? '' : current.q,
    view: explicitlyPatchesView ? patch.view ?? 'children' : current.view,
  }
  next.page = parsePositivePage(String(next.page))
  next.grade = normalizeSearchGrade(next.grade)
  next.q = next.q.trim()
  next.view = next.view === 'hadiths' ? 'hadiths' : 'children'

  const params = new URLSearchParams()
  if (next.page !== 1) params.set(TOPIC_PARAM_NAMES.page, String(next.page))
  if (next.grade) params.set(TOPIC_PARAM_NAMES.grade, next.grade)
  if (next.q) params.set(TOPIC_PARAM_NAMES.q, next.q)
  if (next.view !== 'children') params.set(TOPIC_PARAM_NAMES.view, next.view)

  for (const [name, value] of base.entries()) {
    if (!TOPIC_PARAM_KEYS.has(name)) params.append(name, value)
  }

  const query = params.toString()
  return `/topics/item/${encodeURIComponent(String(itemId))}${query ? `?${query}` : ''}`
}
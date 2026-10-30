'use client'

// The offline reader. With no connection, the service worker answers every page with /offline, and
// this reads the address the reader asked for (/hadith/123, /books/5, /search?q=…) and shows that
// page from the database on the device. Links inside it move between views without a reload.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import OfflineManager from './OfflineManager'
import { refreshOfflineStatus, useOfflineState } from '@/lib/offline/client'
import {
  getBook, getHadith, getNarrator, getSection, getSura, listBooks, listSuras, nodeTitle, plainText,
  searchHadith, searchNarrators, sectionHadiths, type MatchMode, type NarratorBrief,
} from '@/lib/offline/queries'
import { parseSanadNarratorSegments } from '@/lib/sanadNarrators'
import { splitSanadMatn, stripXmlToVerbatim } from '@/lib/hadithText'

declare global {
  interface Window { __OFFLINE_TARGET?: string }
}

type Loc = { path: string; params: URLSearchParams }

const readLoc = (href: string): Loc => {
  const u = new URL(href, location.origin)
  return { path: u.pathname.replace(/\/+$/, '') || '/', params: u.searchParams }
}

const SUPPORTED = /^\/($|offline$|books(\/\d+)?$|hadith\/\d+$|narrator\/\d+$|narrators$|search$|quran(\/\d+)?$)/

export default function OfflineApp() {
  const [loc, setLoc] = useState<Loc | null>(null)
  const offline = useOfflineState()

  useEffect(() => {
    // The address asked for (captured before Next.js rewrote the bar to /offline)
    const target = window.__OFFLINE_TARGET && window.__OFFLINE_TARGET !== '/offline' ? window.__OFFLINE_TARGET : location.pathname + location.search
    setLoc(readLoc(target))
    if (target !== location.pathname + location.search) history.replaceState(history.state, '', target)
    refreshOfflineStatus()
    const onPop = () => setLoc(readLoc(location.href))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // In-app links: handled here for the pages this reader knows, a normal navigation otherwise
  const onClick = useCallback((e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement).closest('a')
    if (!a || a.target || !a.href) return
    const u = new URL(a.href)
    if (u.origin !== location.origin || !SUPPORTED.test(u.pathname)) return
    e.preventDefault()
    history.pushState(null, '', u.pathname + u.search)
    setLoc(readLoc(u.href))
    window.scrollTo(0, 0)
  }, [])

  if (!loc) return <Loading />
  const ready = offline.status?.ready
  const isHome = loc.path === '/' || loc.path === '/offline'

  return (
    <div onClick={onClick} className="max-w-4xl mx-auto font-sans">
      <OfflineBar online={typeof navigator !== 'undefined' && navigator.onLine} />
      {isHome ? (
        <Home ready={!!ready} />
      ) : !offline.status && offline.phase !== 'unsupported' && offline.phase !== 'error' ? (
        <Loading />
      ) : !ready ? (
        <NotDownloaded />
      ) : (
        <View loc={loc} />
      )}
    </div>
  )
}

function View({ loc }: { loc: Loc }) {
  const { path, params } = loc
  let m: RegExpMatchArray | null
  if (path === '/books') return <Books />
  if ((m = path.match(/^\/books\/(\d+)$/))) return <Book id={+m[1]} section={+(params.get('section') || 0) || null} page={+(params.get('page') || 1) || 1} />
  if ((m = path.match(/^\/hadith\/(\d+)$/))) return <Hadith key={m[1]} id={+m[1]} />
  if ((m = path.match(/^\/narrator\/(\d+)$/))) return <Narrator key={m[1]} id={+m[1]} />
  if (path === '/narrators') return <Narrators q={params.get('q') || ''} />
  if (path === '/search') return <Search key={params.toString()} params={params} />
  if (path === '/quran') return <Suras />
  if ((m = path.match(/^\/quran\/(\d+)$/))) return <Sura id={+m[1]} />
  return <Unavailable />
}

// --- data loading -------------------------------------------------------------------------

function useData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    let live = true
    setState({ data: null, error: null })
    load().then(d => live && setState({ data: d, error: null }), e => live && setState({ data: null, error: String(e?.message || e) }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function Async<T>({ state, children }: { state: { data: T | null; error: string | null }; children: (d: T) => ReactNode }) {
  if (state.error) return <Panel><p className="text-red-700 text-sm">تعذّرت القراءة من البيانات المحفوظة: {state.error}</p></Panel>
  if (state.data === null) return <Loading />
  return <>{children(state.data)}</>
}

// --- views ---------------------------------------------------------------------------------

function Home({ ready }: { ready: boolean }) {
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl sm:text-3xl text-green-900">الجامع دون إنترنت</h1>
      <OfflineManager />
      {ready && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile href="/books" title="الكتب" sub="كتب الحديث بأبوابها" />
          <Tile href="/search" title="البحث" sub="في نصوص الأحاديث" />
          <Tile href="/narrators" title="الرواة" sub="تراجم وجرح وتعديل" />
          <Tile href="/quran" title="القرآن الكريم" sub="السور والآيات" />
        </div>
      )}
    </div>
  )
}

function Books() {
  const s = useData(listBooks, [])
  return (
    <>
      <Title>الكتب</Title>
      <Async state={s}>{books => (
        <ul className="grid sm:grid-cols-2 gap-2">
          {books.map(b => (
            <li key={b.id}>
              <a href={`/books/${b.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-accent-gold">
                <span className="font-bold text-green-900 font-serif text-lg">{b.title}</span>
                <span className="block text-xs text-muted mt-0.5">{b.author ? `${b.author} · ` : ''}{num(b.hadith_count)} حديث</span>
              </a>
            </li>
          ))}
        </ul>
      )}</Async>
    </>
  )
}

function Book({ id, section, page }: { id: number; section: number | null; page: number }) {
  const s = useData(async () => {
    const book = await getBook(id)
    if (!book) return null
    const sec = await getSection(id, section)
    const list = sec && sec.children.length === 0 ? await sectionHadiths(id, sec.section, page) : null
    return { book, sec, list }
  }, [id, section, page])
  return (
    <Async state={s}>{d => !d ? <Unavailable /> : (
      <>
        <nav className="text-sm text-muted mb-2 flex flex-wrap gap-x-1">
          <a href="/books" className="hover:underline">الكتب</a> ‹
          <a href={`/books/${id}`} className="hover:underline">{d.book.title}</a>
          {d.sec?.crumbs.map(c => <span key={c.main_id}> ‹ <a href={`/books/${id}?section=${c.main_id}`} className="hover:underline">{clip(nodeTitle(c), 40)}</a></span>)}
        </nav>
        <Title>{d.sec && section ? nodeTitle(d.sec.section) : d.book.title}</Title>
        {!section && d.book.author && <p className="text-muted -mt-3 mb-4">{d.book.author}</p>}
        {d.sec && d.sec.children.length > 0 && (
          <ul className="space-y-1.5">
            {d.sec.children.map(c => (
              <li key={c.main_id}>
                <a href={`/books/${id}?section=${c.main_id}`} className="flex justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 hover:border-accent-gold">
                  <span className="font-serif text-green-900">{nodeTitle(c)}</span>
                  <span className="text-xs text-muted shrink-0 self-center">{num(c.hadith_count)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {d.list && (
          <>
            <HadithList rows={d.list.rows.map(r => ({ ...r, book_title: '' }))} />
            <Pager page={page} total={d.list.total} href={p => `/books/${id}?section=${d.sec!.section.main_id}&page=${p}`} />
          </>
        )}
      </>
    )}</Async>
  )
}

function HadithList({ rows }: { rows: { main_id: number; tarf: string | null; content: string | null; tarqeem_matboa1: string | null; tarqeem_harf: string | null; book_title: string }[] }) {
  if (!rows.length) return <Panel><p className="text-muted">لا أحاديث هنا.</p></Panel>
  return (
    <ul className="space-y-2">
      {rows.map(r => {
        const n = r.tarqeem_matboa1?.trim() || r.tarqeem_harf?.trim()
        const text = stripXmlToVerbatim(r.tarf || '') || splitSanadMatn(r.content || '').matn
        return (
          <li key={r.main_id}>
            <a href={`/hadith/${r.main_id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-accent-gold">
              <span className="text-xs text-muted">{r.book_title}{r.book_title && n ? ' · ' : ''}{n ? `رقم ${n}` : ''}</span>
              <span className="block font-serif text-ink leading-loose mt-1">{clip(text, 260)}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function Hadith({ id }: { id: number }) {
  const s = useData(() => getHadith(id), [id])
  return (
    <Async state={s}>{d => {
      if (!d) return <Unavailable />
      const h = d.hadith
      const { sanad, matn, tail, footnotes } = splitSanadMatn(h.content || '')
      const segments = parseSanadNarratorSegments(h.content || '')
      const byId = new Map(d.narrators.map(n => [n.id, n]))
      const n = h.tarqeem_matboa1?.trim() || h.tarqeem_harf?.trim()
      return (
        <article>
          <nav className="text-sm text-muted mb-2 flex flex-wrap gap-x-1">
            <a href={`/books/${h.book_id}`} className="hover:underline">{h.book_title}</a>
            {d.section && <> ‹ <a href={`/books/${h.book_id}?section=${d.section.main_id}`} className="hover:underline">{clip(nodeTitle(d.section), 50)}</a></>}
          </nav>
          <h1 className="font-display text-xl text-green-900 mb-3">{h.book_title}{n ? ` — رقم ${n}` : ''}</h1>
          <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6 font-serif text-lg leading-[2.2]">
            {segments.length > 0 && segments.some(x => x.kind === 'narrator') ? (
              <p className="text-ink/80">
                {segments.map((seg, i) => seg.kind === 'narrator' && seg.narratorId
                  ? <a key={i} href={`/narrator/${seg.narratorId}`} className="text-green-900 font-bold hover:underline">{seg.text}</a>
                  : <span key={i}>{seg.text}</span>)}
              </p>
            ) : sanad ? <p className="text-ink/80">{sanad}</p> : null}
            {matn && <p className="mt-2 whitespace-pre-line">{matn}</p>}
            {tail && <p className="mt-3 text-base text-muted whitespace-pre-line">{tail}</p>}
            {footnotes.length > 0 && (
              <ol className="mt-4 border-t border-border pt-3 text-sm text-muted space-y-1 font-sans">
                {footnotes.map(f => <li key={f.id}>({f.id}) {f.text}</li>)}
              </ol>
            )}
          </div>

          {(d.dorar?.hukm || d.judgments.length > 0) && (
            <Section title="الحكم على الحديث">
              {d.dorar?.hukm && <p><span className="text-muted">خلاصة حكم المحدث{d.dorar.muhaddith ? ` (${d.dorar.muhaddith})` : ''}:</span> <b>{d.dorar.hukm}</b></p>}
              <ul className="mt-1 space-y-1.5">
                {d.judgments.map((j, i) => (
                  <li key={i}>
                    {j.scientist && (j.scientist_id ? <a href={`/narrator/${j.scientist_id}`} className="font-bold text-green-900 hover:underline">{j.scientist}</a> : <b>{j.scientist}</b>)}
                    {j.scientist ? ': ' : ''}{plainText(j.say_text)}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {d.chains.length > 0 && (
            <Section title="رجال الإسناد">
              {d.chains.slice(0, 6).map((chain, i) => (
                <ol key={i} className="flex flex-wrap gap-1.5 mb-2">
                  {chain.map((nid, j) => {
                    const r = byId.get(nid)
                    return r ? <li key={j}><NarratorChip n={r} /></li> : null
                  })}
                </ol>
              ))}
            </Section>
          )}

          <div className="flex justify-between mt-5 text-sm">
            {h.prev_paragraph_id ? <a href={`/hadith/${h.prev_paragraph_id}`} className="rounded-full border border-border px-4 py-2 hover:border-accent-gold">→ السابق</a> : <span />}
            {h.next_paragraph_id ? <a href={`/hadith/${h.next_paragraph_id}`} className="rounded-full border border-border px-4 py-2 hover:border-accent-gold">التالي ←</a> : <span />}
          </div>
        </article>
      )
    }}</Async>
  )
}

function NarratorChip({ n }: { n: NarratorBrief }) {
  const grade = n.martaba_ibn_hajar || n.martaba_zahabi
  return (
    <a href={`/narrator/${n.id}`} className="inline-block rounded-lg border border-border bg-surface-sunken px-2.5 py-1 text-sm hover:border-accent-gold">
      <span className="font-bold text-green-900">{shortName(n)}</span>
      {(grade || flag(n.is_companion)) ? <span className="text-xs text-muted"> · {flag(n.is_companion) ? 'صحابي' : grade}</span> : null}
    </a>
  )
}

function Narrator({ id }: { id: number }) {
  const s = useData(() => getNarrator(id), [id])
  return (
    <Async state={s}>{d => {
      if (!d) return <Unavailable />
      const n = d.narrator
      const facts: [string, string | null][] = [
        ['الكنية', n.kunia], ['اللقب', n.laqab], ['النسب', n.nasab], ['الشهرة', n.esm_shuhra], ['الطبقة', n.tabaqa],
        ['الولادة', n.birth_year], ['الوفاة', n.death_year], ['بلد الإقامة', n.living_city], ['بلد الوفاة', n.death_city],
        ['المذهب', n.mazhb], ['رتبته عند ابن حجر', n.martaba_ibn_hajar], ['رتبته عند الذهبي', n.martaba_zahabi],
      ]
      return (
        <article>
          <Title>{shortName(n)}</Title>
          {n.abb_name && n.name !== n.abb_name && <p className="-mt-3 mb-3 font-serif text-muted leading-relaxed">{n.name}</p>}
          {(n.companion_title || flag(n.is_companion)) ? <p className="-mt-3 mb-3 text-green-900 font-bold">{n.companion_title || (flag(n.is_female) ? 'صحابية' : 'صحابي')}</p> : null}
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 rounded-2xl border border-border bg-surface p-4 text-sm">
            {facts.filter(([, v]) => v && v.trim() && v !== '0').map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="text-muted shrink-0">{k}:</dt><dd>{v}</dd></div>
            ))}
            {n.hadiths_count ? <div className="flex gap-2"><dt className="text-muted">مروياته في الكتب:</dt><dd>{num(n.hadiths_count)}</dd></div> : null}
          </dl>

          {d.criticism.length > 0 && (
            <Section title="أقوال العلماء فيه">
              <ul className="space-y-1.5">
                {d.criticism.map((c, i) => <li key={i}><b className="text-green-900">{c.scientist_name}</b>: {plainText(c.say_text)}</li>)}
              </ul>
            </Section>
          )}
          {d.teachers.length > 0 && <Section title="شيوخه"><Chips list={d.teachers} /></Section>}
          {d.students.length > 0 && <Section title="تلاميذه"><Chips list={d.students} /></Section>}
          {d.bios.length > 0 && (
            <Section title="ترجمته في كتب التراجم">
              <div className="space-y-2">
                {d.bios.map(b => (
                  <details key={b.id} className="rounded-xl border border-border bg-surface px-3 py-2">
                    <summary className="cursor-pointer font-bold text-green-900">{b.book_name}{b.title ? ` — ${plainText(b.title)}` : ''}</summary>
                    <p className="font-serif leading-loose mt-2 whitespace-pre-line">{plainText(b.content)}</p>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </article>
      )
    }}</Async>
  )
}

const Chips = ({ list }: { list: NarratorBrief[] }) => (
  <div className="flex flex-wrap gap-1.5">{list.map(n => <NarratorChip key={n.id} n={n} />)}</div>
)

function Narrators({ q }: { q: string }) {
  const [text, setText] = useState(q)
  const s = useData(() => (q.trim() ? searchNarrators(q) : Promise.resolve(null)), [q])
  return (
    <>
      <Title>الرواة</Title>
      <SearchBox value={text} onChange={setText} action="/narrators" placeholder="اسم الراوي أو كنيته…" />
      {q.trim() && (
        <Async state={s}>{rows => !rows || rows.length === 0 ? <Panel><p className="text-muted">لا نتائج.</p></Panel> : (
          <ul className="grid sm:grid-cols-2 gap-2 mt-4">
            {rows.map(n => (
              <li key={n.id}>
                <a href={`/narrator/${n.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-accent-gold">
                  <span className="font-bold text-green-900">{shortName(n)}</span>
                  <span className="block text-xs text-muted">{[flag(n.is_companion) ? 'صحابي' : (n.martaba_ibn_hajar || n.martaba_zahabi), n.death_year && `ت ${n.death_year}`].filter(Boolean).join(' · ')}</span>
                </a>
              </li>
            ))}
          </ul>
        )}</Async>
      )}
    </>
  )
}

function Search({ params }: { params: URLSearchParams }) {
  const q = params.get('q') || ''
  const mode = (['all', 'any'].includes(params.get('match') || '') ? params.get('match') : 'phrase') as MatchMode
  const scope = params.get('search_scope') === 'tarf' ? 'tarf' : 'all'
  const page = Math.max(1, +(params.get('page') || 1) || 1)
  const bookId = +(params.get('book_id') || 0) || null
  const [text, setText] = useState(q)
  const s = useData(() => (q.trim() ? searchHadith(q, mode, scope, page, bookId) : Promise.resolve(null)), [q, mode, scope, page, bookId])
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    return `/search?${p}`
  }
  return (
    <>
      <Title>البحث في الأحاديث</Title>
      <SearchBox value={text} onChange={setText} action="/search" placeholder="كلمات من نص الحديث…" extra={{ match: mode === 'phrase' ? '' : mode, search_scope: scope === 'tarf' ? 'tarf' : '' }} />
      <div className="flex flex-wrap gap-2 mt-3 text-sm">
        {([['phrase', 'عبارة متتالية'], ['all', 'كل الكلمات'], ['any', 'أي كلمة']] as const).map(([k, label]) => (
          <a key={k} href={href({ match: k === 'phrase' ? '' : k, page: '' })}
            className={`rounded-full px-3 py-1 border ${mode === k ? 'bg-primary text-on-dark border-primary' : 'border-border'}`}>{label}</a>
        ))}
      </div>
      {q.trim() && (
        <Async state={s}>{r => !r ? null : (
          <div className="mt-4">
            <p className="text-sm text-muted mb-2">{num(r.total)} نتيجة</p>
            <HadithList rows={r.rows} />
            <Pager page={page} total={r.total} href={p => href({ page: String(p) })} />
          </div>
        )}</Async>
      )}
    </>
  )
}

function Suras() {
  const s = useData(listSuras, [])
  return (
    <>
      <Title>القرآن الكريم</Title>
      <Async state={s}>{rows => (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {rows.map(r => (
            <li key={r.id}>
              <a href={`/quran/${r.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-accent-gold">
                <span className="text-xs text-muted">{num(r.id)}</span> <span className="font-bold text-green-900">{r.name}</span>
                <span className="block text-xs text-muted">{num(r.ayat)} آية</span>
              </a>
            </li>
          ))}
        </ul>
      )}</Async>
    </>
  )
}

function Sura({ id }: { id: number }) {
  const s = useData(() => getSura(id), [id])
  return (
    <Async state={s}>{d => !d ? <Unavailable /> : (
      <>
        <nav className="text-sm text-muted mb-2"><a href="/quran" className="hover:underline">القرآن الكريم</a></nav>
        <Title>سورة {d.sura.name}</Title>
        <p className="rounded-2xl border border-border bg-surface p-4 sm:p-6 font-serif text-xl leading-[2.4] text-justify">
          {d.ayat.map(a => <span key={a.id}>{a.text} <span className="text-accent-gold-dark text-base">﴿{num(a.aya_num)}﴾</span> </span>)}
        </p>
        <div className="flex justify-between mt-5 text-sm">
          {id > 1 ? <a href={`/quran/${id - 1}`} className="rounded-full border border-border px-4 py-2">→ السورة السابقة</a> : <span />}
          {id < 114 ? <a href={`/quran/${id + 1}`} className="rounded-full border border-border px-4 py-2">السورة التالية ←</a> : <span />}
        </div>
      </>
    )}</Async>
  )
}

// --- pieces --------------------------------------------------------------------------------

function OfflineBar({ online }: { online: boolean }) {
  if (online) return null
  return (
    <div className="mb-4 rounded-xl bg-surface-sunken border border-border px-3 py-2 text-sm flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-accent-gold" /> لا يوجد اتصال — تقرأ من النسخة المحفوظة على جهازك.
      <a href="/offline" className="mr-auto underline underline-offset-2">الصفحة الرئيسية</a>
    </div>
  )
}

function SearchBox({ value, onChange, action, placeholder, extra = {} }: {
  value: string; onChange: (v: string) => void; action: string; placeholder: string; extra?: Record<string, string>
}) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        const p = new URLSearchParams({ q: value.trim() })
        Object.entries(extra).forEach(([k, v]) => v && p.set(k, v))
        const a = document.createElement('a')
        a.href = `${action}?${p}`
        ;(e.currentTarget.parentElement as HTMLElement).appendChild(a)
        a.click()
        a.remove()
      }}
      className="flex gap-2"
    >
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type="search"
        className="flex-1 min-w-0 rounded-full border border-border bg-surface px-4 py-2.5 font-serif text-lg focus:outline-none focus:border-primary" />
      <button type="submit" className="rounded-full bg-primary text-on-dark font-bold px-5">بحث</button>
    </form>
  )
}

function Pager({ page, total, href, size = 20 }: { page: number; total: number; href: (p: number) => string; size?: number }) {
  const pages = Math.ceil(total / size)
  if (pages <= 1) return null
  return (
    <div className="flex justify-center items-center gap-3 mt-5 text-sm">
      {page > 1 && <a href={href(page - 1)} className="rounded-full border border-border px-4 py-2">→ السابق</a>}
      <span className="text-muted">صفحة {num(page)} من {num(pages)}</span>
      {page < pages && <a href={href(page + 1)} className="rounded-full border border-border px-4 py-2">التالي ←</a>}
    </div>
  )
}

const Title = ({ children }: { children: ReactNode }) => <h1 className="font-display text-2xl text-green-900 mb-4">{children}</h1>
const Panel = ({ children }: { children: ReactNode }) => <div className="rounded-2xl border border-border bg-surface p-4">{children}</div>
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-6">
    <h2 className="font-bold text-green-900 mb-2">{title}</h2>
    <div className="text-[15px] leading-relaxed">{children}</div>
  </section>
)
const Tile = ({ href, title, sub }: { href: string; title: string; sub: string }) => (
  <a href={href} className="rounded-2xl border border-border bg-surface p-4 hover:border-accent-gold">
    <span className="block font-bold text-green-900 text-lg">{title}</span>
    <span className="block text-xs text-muted mt-1">{sub}</span>
  </a>
)
const Loading = () => (
  <div className="flex justify-center py-16" aria-label="جارٍ التحميل">
    <span className="w-8 h-8 rounded-full border-4 border-border border-t-primary animate-spin" />
  </div>
)
const NotDownloaded = () => (
  <div className="space-y-4">
    <Panel>
      <p className="font-bold text-green-900">لا يوجد اتصال بالإنترنت</p>
      <p className="text-sm text-muted mt-1">لم تُحمَّل نسخة الجامع على هذا الجهاز بعد. عند عودة الاتصال حمّلها لتعمل دون إنترنت.</p>
    </Panel>
    <OfflineManager />
  </div>
)
const Unavailable = () => (
  <Panel>
    <p className="font-bold text-green-900">هذه الصفحة غير متاحة دون اتصال</p>
    <p className="text-sm text-muted mt-1">المتاح دون إنترنت: الكتب، والأحاديث، والبحث، والرواة، والقرآن الكريم.</p>
    <a href="/offline" className="inline-block mt-3 underline underline-offset-2">الصفحة الرئيسية دون إنترنت</a>
  </Panel>
)

const shortName = (n: { name: string; abb_name: string | null }) => n.abb_name?.trim() || clip(n.name, 60)
// Booleans come back as 1/0 (or '1'/'0' from the first edition of the data)
const flag = (v: unknown) => v === 1 || v === '1' || v === true
const num = (n: number) => Number(n).toLocaleString('ar-EG')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

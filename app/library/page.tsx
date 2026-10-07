import { redirect } from 'next/navigation'
import Link from '@/app/components/Link'
import { currentUser } from '@/lib/auth'
import { allTags, hadithInfo, listCollections, listHighlights, listNotes } from '@/lib/library'
import NewCollection from './NewCollection'
import ItemSummary from './ItemSummary'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مكتبتي — الجامع', robots: { index: false } }

// «مكتبتي»: the signed-in reader's collections, notes and tags (lib/library.ts)
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login?next=/library')
  const q = (await searchParams).q?.trim() || ''
  const [collections, tags, notes, highlights] = await Promise.all([listCollections(user.id), allTags(user.id), listNotes(user.id, q, 50), listHighlights(user.id)])
  const recent = [...highlights].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30)
  const hInfo = new Map((await hadithInfo([...new Set(recent.map(h => h.hadith_id))])).map(h => [h.main_id, h]))
  const fmt = (d: string) => new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[2.2rem] font-bold text-green-900">مكتبتي</h1>
          <p className="text-sm sm:text-[1.15rem] text-gray-500 mt-1">مجموعاتك البحثية وملاحظاتك — في حسابك، على كل أجهزتك · خاصة بك ما لم تشاركها</p>
        </div>
        <div className="flex gap-2 text-sm sm:text-[1.1rem]">
          <Link href="/account" className="rounded-lg border border-border px-3 py-1.5 text-gray-600 hover:border-green-600">حسابي</Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl sm:text-[1.7rem] font-bold text-green-900">المجموعات</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {collections.map(c => (
            <Link key={c.id} href={`/library/${c.id}`} className="ui-card rounded-xl p-4 hover:border-green-600 border border-transparent transition-colors min-h-[7rem] flex flex-col">
              <span className="text-base sm:text-[1.35rem] font-bold text-gray-900 line-clamp-2">{c.title}</span>
              {c.description && <span className="text-xs sm:text-[1.05rem] text-gray-500 mt-1 line-clamp-2">{c.description}</span>}
              <span className="mt-auto pt-2 text-xs sm:text-[1rem] text-gray-400 flex gap-3">
                <span>{c.items.toLocaleString('ar-EG')} عنصرًا</span>
                <span>{fmt(c.updated_at)}</span>
                {c.shared && <span className="text-green-700">مُشارَكة</span>}
              </span>
            </Link>
          ))}
          <NewCollection />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl sm:text-[1.7rem] font-bold text-green-900">الملاحظات</h2>
          <form className="flex gap-2 text-sm sm:text-[1.1rem]" action="/library">
            <input name="q" defaultValue={q} placeholder="ابحث في ملاحظاتك ووسومك…" className="rounded-lg border border-border bg-white px-3 py-1.5 w-56 sm:w-72 focus:outline-none focus:border-green-600" />
            <button className="rounded-lg bg-green-800 text-white px-3">بحث</button>
          </form>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs sm:text-[1.05rem]">
            {tags.map(t => (
              <Link key={t.tag} href={`/library?q=${encodeURIComponent(t.tag)}`}
                className={`rounded-full border px-2.5 py-0.5 ${q === t.tag ? 'bg-green-800 text-white border-green-800' : 'border-border text-gray-700 hover:border-green-600'}`}>
                {t.tag} <span className="opacity-60">{t.n.toLocaleString('ar-EG')}</span>
              </Link>
            ))}
            {q && <Link href="/library" className="px-2 py-0.5 text-gray-500 hover:underline">× الكل</Link>}
          </div>
        )}
        <div className="ui-card rounded-xl divide-y divide-border">
          {notes.length === 0 && (
            <p className="p-4 text-sm sm:text-[1.15rem] text-gray-500">
              {q ? 'لا ملاحظات تطابق البحث.' : 'لا ملاحظات بعد — اكتب ملاحظة بحثية على أي حديث من صفحته («إضافة ملاحظة بحثية»).'}
            </p>
          )}
          {notes.map((n, i) => (
            <div key={i} className="p-4 space-y-1.5">
              <ItemSummary item={n} />
              {n.note && <p className="text-sm sm:text-[1.15rem] text-gray-700 whitespace-pre-wrap bg-blue-50/60 rounded-lg px-3 py-2">{n.note}</p>}
              {n.tags.length > 0 && <p className="text-xs sm:text-[1rem] text-gray-500">{n.tags.map(t => `#${t}`).join(' ')}</p>}
            </div>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl sm:text-[1.7rem] font-bold text-green-900">التظليلات</h2>
          <div className="ui-card rounded-xl divide-y divide-border">
            {recent.map(h => {
              const info = hInfo.get(h.hadith_id)
              return (
                <div key={h.id} className="p-4 space-y-1">
                  <div className="text-xs sm:text-[1.05rem] text-gray-500 font-sans">
                    <Link href={`/hadith/${h.hadith_id}`} className="font-semibold text-green-800 hover:underline">{info?.book ?? 'حديث'}{info?.printed_number ? ` ${info.printed_number}` : ''}</Link>
                    <span> · {h.part === 'sanad' ? 'السند' : 'المتن'}</span>
                  </div>
                  <p className="text-[0.95rem] sm:text-[1.3rem]"><span className="bg-amber-100/80 rounded px-1">{h.quote.trim()}</span></p>
                  {h.note && <p className="text-sm sm:text-[1.15rem] text-gray-600 whitespace-pre-wrap">{h.note}</p>}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

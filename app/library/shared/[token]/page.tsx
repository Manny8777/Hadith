import { notFound } from 'next/navigation'
import { getCollection } from '@/lib/library'
import ItemSummary from '../../ItemSummary'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مجموعة مُشارَكة — الجامع', robots: { index: false, follow: false } }

// A collection its owner shared by link: read-only — its items and the owner's notes and tags on them
export default async function SharedCollection({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[\w-]{10,40}$/.test(token)) notFound()
  const c = await getCollection(null, 0, token)
  if (!c) notFound()
  const ids = c.list.filter(i => i.kind === 'hadith').map(i => i.ref).join(',')
  return (
    <div dir="rtl" className="max-w-5xl mx-auto space-y-6">
      <header className="ui-card rounded-2xl p-5">
        <p className="text-xs sm:text-[1rem] text-gray-500 mb-1">مجموعة بحثية مُشارَكة للقراءة</p>
        <h1 className="text-2xl sm:text-[2.1rem] font-bold text-green-900">{c.title}</h1>
        {c.description && <p className="text-sm sm:text-[1.15rem] text-gray-600 mt-1 whitespace-pre-wrap">{c.description}</p>}
        {ids && (
          <p className="text-sm sm:text-[1.1rem] mt-3 flex flex-wrap gap-x-3 gap-y-1">
            <span className="text-gray-500">تنزيل المراجع:</span>
            {[['bib', 'BibTeX'], ['ris', 'RIS'], ['json', 'CSL-JSON'], ['txt', 'حواشٍ عربية']].map(([f, n]) => (
              <a key={f} href={`/api/cite?ids=${ids}&format=${f}&download=1`} className="text-green-700 hover:underline" dir="ltr">{n}</a>
            ))}
          </p>
        )}
      </header>
      <ol className="space-y-2">
        {c.list.map((it, i) => (
          <li key={it.id} className="ui-card rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 text-center text-sm sm:text-[1.1rem] text-gray-400 pt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <ItemSummary item={it} />
                {it.note && <p className="text-sm sm:text-[1.15rem] text-gray-700 whitespace-pre-wrap bg-blue-50/60 rounded-lg px-3 py-2">{it.note}</p>}
                {it.tags.length > 0 && <p className="text-xs sm:text-[1rem] text-gray-500">{it.tags.map(t => `#${t}`).join(' ')}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

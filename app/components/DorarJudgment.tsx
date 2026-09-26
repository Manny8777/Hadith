// Dorar's rulings on this hadith, as fetched offline by scripts/dorar-crawl.mjs into dorar_rulings.
// Each ruling is shown under its muhaddith and source, with a link back to Dorar.

export interface DorarRuling {
  source: string
  dorar_number: string
  muhaddith: string | null
  rawi: string | null
  hukm: string | null
  dorar_hash: string | null
}

function gradeStyle(hukm: string) {
  if (/ضعيف|منكر|موضوع|باطل|لا يصح|لا أصل|كذب|متروك/.test(hukm)) return 'bg-red-100 text-red-700 border-red-200'
  if (/صحيح/.test(hukm)) return 'bg-green-100 text-green-800 border-green-200'
  if (/حسن/.test(hukm)) return 'bg-blue-100 text-blue-800 border-blue-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

export default function DorarJudgment({ rulings, searchUrl, crawled }: {
  rulings: DorarRuling[]
  // Dorar's search for this text, for when a ruling has no share link or none was matched
  searchUrl: string
  // Whether the crawler has looked this number up (so "not found" can be told from "not yet")
  crawled: boolean
}) {
  return (
    <section id="dorar" className="ui-card mb-3 scroll-mt-header overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border bg-surface-sunken/40 flex items-center gap-2 flex-wrap">
        <span className="text-base font-bold text-ink font-display">حكم المحدِّثين في الدرر السنية</span>
        <span className="text-xs text-gray-500 font-sans">من الموسوعة الحديثية — dorar.net</span>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-3">
        {rulings.map((r, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3">
            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${gradeStyle(r.hukm ?? '')}`}>
              {r.hukm || '—'}
            </span>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 font-sans">
              {r.muhaddith && <span><span className="text-gray-400">المحدث:</span> {r.muhaddith}</span>}
              <span><span className="text-gray-400">المصدر:</span> {r.source}</span>
              <span><span className="text-gray-400">الصفحة أو الرقم:</span> {r.dorar_number}</span>
              {r.rawi && <span><span className="text-gray-400">الراوي:</span> {r.rawi}</span>}
            </div>
            <a href={r.dorar_hash ? `https://dorar.net/h/${r.dorar_hash}` : searchUrl}
              target="_blank" rel="noopener noreferrer"
              className="inline-block mt-2 text-xs text-green-700 hover:text-green-900 hover:underline">
              {r.dorar_hash ? 'عرض البطاقة في الدرر السنية ←' : 'البحث عنه في الدرر السنية ←'}
            </a>
          </div>
        ))}

        {rulings.length === 0 && (
          <p className="text-sm text-gray-500">
            {crawled
              ? 'لم يُعثر على هذا الحديث برقمه في الموسوعة الحديثية بالدرر السنية.'
              : 'لم يُجلب حكم هذا الحديث من الدرر السنية بعد.'}
            {' '}
            <a href={searchUrl} target="_blank" rel="noopener noreferrer"
              className="text-green-700 hover:text-green-900 hover:underline">
              البحث في الدرر السنية ←
            </a>
          </p>
        )}
      </div>
    </section>
  )
}

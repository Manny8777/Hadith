// Dorar's ruling on this hadith, as fetched offline by scripts/dorar-crawl.mjs into dorar_rulings,
// shown inline under the hadith title: «خلاصة حكم المحدث: [صحيح] عرض في الدرر السنية».

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

export default function DorarJudgment({ rulings, searchUrl }: {
  rulings: DorarRuling[]
  // Dorar's search for this text, for a ruling whose card link is not known
  searchUrl: string
}) {
  // With several rulings (the book's own and later gradings) each is named by its muhaddith
  const named = rulings.length > 1
  return (
    <>
      {rulings.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 flex-wrap text-xs text-gray-600 font-sans">
          <span className="text-gray-500">خلاصة حكم المحدث{named && r.muhaddith ? ` (${r.muhaddith})` : ''}:</span>
          <span className={`font-bold px-2 py-0.5 rounded border ${gradeStyle(r.hukm ?? '')}`}>{r.hukm || '—'}</span>
          <a href={r.dorar_hash ? `https://dorar.net/h/${r.dorar_hash}` : searchUrl}
            target="_blank" rel="noopener noreferrer"
            className="text-green-700 hover:text-green-900 hover:underline">
            عرض في الدرر السنية
          </a>
        </span>
      ))}
    </>
  )
}

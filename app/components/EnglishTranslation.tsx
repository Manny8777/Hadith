// The English translation of a hadith, from Sunnah.com (stored by scripts/sunnah-import.mjs, linked to
// our record by scripts/sunnah-match.mjs), shown under the matn with a link back to it there. Its grade
// is the one Sunnah.com gives, always shown with whoever graded it (al-Albani, Darussalam, Zubair
// 'Ali Za'i) — quoted and attributed, never a grading of ours.

export const SUNNAH_COLLECTIONS: Record<string, string> = {
  bukhari: 'Sahih al-Bukhari', muslim: 'Sahih Muslim', abudawud: 'Sunan Abi Dawud', tirmidhi: "Jami` at-Tirmidhi",
  nasai: "Sunan an-Nasa'i", ibnmajah: 'Sunan Ibn Majah', malik: 'Muwatta Malik', ahmad: 'Musnad Ahmad',
  shamail: "Ash-Shama'il Al-Muhammadiyah",
}

export interface EnglishTranslationData {
  collection: string
  hadith_number: string
  en_body: string
  en_chapter: string | null
  en_grades: { graded_by: string | null; grade: string | null }[] | null
}

// Sunnah.com's text is simple HTML (<p>, <b>, <i>, <br>); keep only those, without attributes
function clean(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(\/?)(p|b|i|em|strong|br)\b[^>]*>/gi, '<$1$2>')
    .replace(/<(?!\/?(p|b|i|em|strong|br)>)[^>]*>/gi, '')
    .replace(/(<br>\s*){3,}/gi, '<br><br>')
    .trim()
}

export default function EnglishTranslation({ data }: { data: EnglishTranslationData }) {
  const name = SUNNAH_COLLECTIONS[data.collection] ?? data.collection
  const url = `https://sunnah.com/${data.collection}:${encodeURIComponent(data.hadith_number)}`
  const grades = (data.en_grades ?? []).filter(g => g.grade?.trim())
  return (
    <details open className="english-translation mt-4 pt-3 border-t border-border group" lang="en" dir="ltr">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 font-sans text-base sm:text-[1.15rem] marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-gray-700">English translation</span>
        <span className="text-sm text-gray-400 group-open:hidden" dir="rtl">إظهار الترجمة الإنجليزية</span>
      </summary>
      {data.en_chapter && (
        <p className="mt-2 text-sm sm:text-[1.1rem] text-gray-500 font-sans" dangerouslySetInnerHTML={{ __html: clean(data.en_chapter) }} />
      )}
      <div
        className="mt-2 text-[1.0625rem] sm:text-[1.4rem] leading-relaxed text-gray-800 font-sans [&_p]:mb-2 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: clean(data.en_body) }}
      />
      {grades.length > 0 && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm sm:text-[1.15rem] font-sans">
          <span className="font-semibold text-gray-600">Grade:</span>
          {grades.map((g, i) => (
            <span key={i} className="inline-flex flex-wrap items-baseline gap-x-1.5 rounded-md bg-surface-sunken/60 border border-border px-2 py-0.5 text-gray-800">
              <span dangerouslySetInnerHTML={{ __html: clean(g.grade!).replace(/<br>/gi, ' · ') }} />
              <span className="text-gray-500">— {g.graded_by?.trim() || 'as given on Sunnah.com'}</span>
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm sm:text-[1.05rem] text-gray-500 font-sans">
        Translation{grades.length > 0 ? ' and grade' : ''} from{' '}
        <a href={url} target="_blank" rel="noopener" className="text-green-700 hover:underline">
          Sunnah.com — {name} {data.hadith_number} ↗
        </a>
      </p>
    </details>
  )
}

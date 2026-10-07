// The English translation of a hadith, from Sunnah.com (stored by scripts/sunnah-import.mjs, linked to
// our record by scripts/sunnah-match.mjs), shown under the matn with a link back to it there.

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
  return (
    <details open className="english-translation mt-4 pt-3 border-t border-border group" lang="en" dir="ltr">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 font-sans text-sm marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-gray-700">English translation</span>
        <span className="text-xs text-gray-400 group-open:hidden" dir="rtl">إظهار الترجمة الإنجليزية</span>
      </summary>
      {data.en_chapter && (
        <p className="mt-2 text-xs text-gray-500 font-sans" dangerouslySetInnerHTML={{ __html: clean(data.en_chapter) }} />
      )}
      <div
        className="mt-2 text-[0.95rem] leading-relaxed text-gray-800 font-sans [&_p]:mb-2 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: clean(data.en_body) }}
      />
      <p className="mt-3 text-xs text-gray-500 font-sans">
        Translation from{' '}
        <a href={url} target="_blank" rel="noopener" className="text-green-700 hover:underline">
          Sunnah.com — {name} {data.hadith_number} ↗
        </a>
      </p>
    </details>
  )
}

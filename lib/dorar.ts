// The Dorar (dorar.net) hadith encyclopedia holds rulings on hadiths, keyed by the source book and
// the hadith's printed number in it. It cannot be queried from the reader's browser (the API sends
// no CORS headers and its JSONP is served as text/html + nosniff, which browsers refuse to run) nor
// from our server (Cloudflare answers Node's fetch with 403), so scripts/dorar-crawl.mjs fetches the
// rulings offline into dorar_rulings and the hadith page reads them from there.

export interface DorarSource { id: number; name: string }

// Our book id → the Dorar sources numbered like that book: the book itself plus the later gradings
// printed in its numbering (al-Albani's صحيح/ضعيف, Shu'ayb's تخريج). `name` is Dorar's «المصدر» text.
// Left out on purpose: al-Albani's صحيح/ضعيف ابن ماجه (his own numbering) and Shakir's Musnad
// (cited by volume/page) — a number match there would not identify the hadith.
export const DORAR_SOURCES: Record<number, DorarSource[]> = {
  1: [{ id: 6216, name: 'صحيح البخاري' }],
  2: [{ id: 3088, name: 'صحيح مسلم' }],
  3: [
    { id: 6267, name: 'سنن أبي داود' }, { id: 13559, name: 'صحيح أبي داود' },
    { id: 3695, name: 'ضعيف أبي داود' }, { id: 52, name: 'تخريج سنن أبي داود' },
  ],
  4: [
    { id: 13509, name: 'سنن الترمذي' }, { id: 977, name: 'صحيح الترمذي' },
    { id: 3641, name: 'ضعيف الترمذي' }, { id: 13502, name: 'تخريج سنن الترمذي' },
  ],
  5: [{ id: 13508, name: 'سنن النسائي' }, { id: 13561, name: 'صحيح النسائي' }, { id: 3675, name: 'ضعيف النسائي' }],
  6: [{ id: 6264, name: 'سنن ابن ماجه' }],
  8: [{ id: 64, name: 'تخريج المسند لشعيب' }],
  10: [{ id: 16582, name: 'صحيح ابن حبان' }, { id: 17576, name: 'تخريج صحيح ابن حبان' }],
  11: [{ id: 13558, name: 'صحيح ابن خزيمة' }],
  13: [{ id: 16584, name: 'المعجم الأوسط' }],
  14: [{ id: 17609, name: 'المعجم الصغير' }],
  17: [{ id: 13470, name: 'السنن الكبرى للبيهقي' }],
  18: [{ id: 13501, name: 'سنن الدارقطني' }, { id: 46, name: 'تخريج سنن الدارقطني' }],
  22: [{ id: 13469, name: 'السنن الكبرى للنسائي' }],
  24: [{ id: 16226, name: 'المستدرك على الصحيحين' }, { id: 17646, name: 'تلخيص المستدرك' }],
  25: [{ id: 95, name: 'الأحاديث المختارة' }],
  26: [{ id: 6365, name: 'المطالب العالية' }],
  28: [{ id: 1022, name: 'شرح معاني الآثار' }],
  31: [{ id: 1153, name: 'شرح مشكل الآثار' }, { id: 50, name: 'تخريج مشكل الآثار' }],
  32: [{ id: 13479, name: 'المراسيل لأبي داود' }, { id: 59, name: 'تخريج المراسيل لأبي داود' }],
}

// Printed numbers (مطبوع, طبعة ثانية) — never the حرف numbering, which could collide with another
// hadith. Shu'ayb's Musnad follows our طبعة_ثانية, the others our مطبوع.
export function printedNumbers(xml: string | null | undefined): string[] {
  if (!xml) return []
  return [...new Set(
    [...xml.matchAll(/<رقم_حديث نوع="(?:مطبوع|طبعة_ثانية)">([^<]+)</g)].map(m => m[1].trim()).filter(Boolean)
  )]
}

// The key a hadith's rulings are stored under: its first printed number. Hadiths grouped under one
// number share it; looking rulings up by every printed number instead would, for the Musnad, also
// pick up Dorar's card for our مطبوع number, which in Shu'ayb's numbering is a different hadith.
export function dorarKey(xml: string | null | undefined): string | null {
  return printedNumbers(xml)[0] ?? null
}

// Matn words with diacritics and the salawat formula removed, in reading order — what Dorar's
// text search is given.
export function matnSearchWords(xml: string | null | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<متن[^>]*>([\s\S]*?)<\/متن>/g)].map(m => m[1]).join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/صل[يى] الله عليه وسلم/g, ' ')
    .replace(/[^ء-ي\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
}

// Dorar's own search page for this text, limited to the book's sources — the link when no card's
// share link is known. That page needs every word to appear in its own spelling and misses words
// with a hamza on the alef, so it gets a few words with a plain alef.
export function dorarSearchUrl(words: string[], sources: DorarSource[]): string {
  const q = words.slice(0, 3).join(' ').replace(/[أإآ]/g, 'ا')
  return `https://dorar.net/hadith/search?q=${encodeURIComponent(q)}&st=w`
    + sources.map(s => `&s%5B%5D=${s.id}`).join('')
}

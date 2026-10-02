// «مطابقة التشكيل»: a search that respects the harakat typed in the query. The ordinary search folds
// every vowel away (زُبْد = زَبَد = زَبْد), which is right for finding a wording but not for a word whose
// meaning is in its vowels. This builds a PostgreSQL regex over the raw, voweled text:
//
//   - a letter typed WITH harakat must carry exactly those harakat in the text (in any order — texts
//     store shadda+fatha both ways), no more and no fewer: زُبْد does not match زُّبْد (the shadda
//     changes the word) nor زَبْد;
//   - a letter typed WITHOUT harakat matches it however it is voweled, so a partly voweled query works
//     (زُبد: only the zay's damma is required);
//   - letters fold as the ordinary search folds them (ا/أ/إ/آ/ٱ, ة/ه, ى/ي), and whole words only.
//
// It is applied on top of the ordinary (indexed) match, so it only narrows those results. The regex is
// written with the characters themselves and no backslashes: the database has
// standard_conforming_strings off, where a backslash in a plain literal is an escape.

const HARAKAT = 'ًٌٍَُِّْۡ' // tanween ×3, fatha, damma, kasra, shadda, sukun, Quranic sukun
// other marks that may sit on a letter without changing what the query asks: dagger alef, madda,
// hamza above/below, small high signs, tatweel
const OTHER = 'ٰٕٖٜٟۣ۪ۭٓٔٗ٘ٙٚٛٝٞۖۗۘۙۚۛۜ۟۠ۢۤۧۨ۫۬ـ'
const MARKS = HARAKAT + OTHER
const LETTERS = 'ء-يٱ-ۓ'

const FOLD: Record<string, string> = {
  'ا': 'اأإآٱ', 'أ': 'اأإآٱ', 'إ': 'اأإآٱ', 'آ': 'اأإآٱ', 'ٱ': 'اأإآٱ',
  'ة': 'ةه', 'ه': 'ةه', 'ى': 'ىي', 'ي': 'ىي',
}

const isHaraka = (ch: string) => HARAKAT.includes(ch)
const isMark = (ch: string) => MARKS.includes(ch)
const isLetter = (ch: string) => /[ء-يٱ-ۓ]/.test(ch)

/** Does the query carry any harakat at all? Without them the option changes nothing. */
export const hasHarakat = (q: string) => [...q].some(isHaraka)

function permutations(xs: string[]): string[][] {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]))
}

function letterPattern(letter: string, harakat: string[]): string {
  const base = FOLD[letter] ? `[${FOLD[letter]}]` : letter
  if (!harakat.length) return `${base}[${MARKS}]*`
  // the Quranic sukun is a sukun
  const want = [...new Set(harakat.map(h => (h === 'ۡ' ? 'ْ' : h)))]
  const one = (h: string) => (h === 'ْ' ? '[ْۡ]' : h)
  const orders = permutations(want).map(p => p.map(one).join(`[${OTHER}]*`))
  // exactly these harakat: after them, no further haraka before the next letter
  return `${base}[${OTHER}]*(?:${orders.join('|')})(?![${OTHER}]*[${HARAKAT}])[${OTHER}]*`
}

function wordPattern(word: string): string | null {
  const chars = [...word]
  let out = ''
  let any = false
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (!isLetter(ch)) continue
    const harakat: string[] = []
    let j = i + 1
    while (j < chars.length && isMark(chars[j])) { if (isHaraka(chars[j])) harakat.push(chars[j]); j++ }
    out += letterPattern(ch, harakat)
    any = true
    i = j - 1
  }
  return any ? `(?<![${LETTERS}${MARKS}])${out}(?![${LETTERS}])` : null
}

/**
 * The regexes for a query: one for a phrase (the words in order, anything that is not a letter
 * between them), or one per word for «كل الكلمات» / «أي من الكلمات».
 */
export function tashkeelRegexes(q: string, mode: 'phrase' | 'all' | 'any'): string[] {
  const words = q.split(/\s+/).map(wordPattern).filter((w): w is string => !!w)
  if (!words.length) return []
  if (mode === 'phrase') return [words.join(`[^${LETTERS}]+`)]
  return words
}

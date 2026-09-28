// The original catalogue stores each book's citation card in `books.card_info` as a small XML-ish
// block whose fields are separated by `<نه/>` line breaks («الكتاب: …», «الناشر: …», «الطبعة: …»).
// Readers need those fields next to the text they are reading, so the same parsing the
// documentation export uses (db/export_books_md.js) is shared here.

export function cardInfoLines(cardInfo: string | null | undefined): string[] {
  if (!cardInfo) return []
  return cardInfo
    .replace(/<نه\/>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

// Label variants exist in the source data («الكتاب» and «اسم الكتاب», for example), so callers pass
// the variants in the order they should take precedence.
export function cardInfoField(lines: string[], labels: string[]): string | null {
  for (const label of labels) {
    const line = lines.find(candidate => candidate.startsWith(label))
    if (line) {
      const value = line.slice(label.length).replace(/^\s*:\s*/, '').trim()
      if (value) return value
    }
  }
  return null
}

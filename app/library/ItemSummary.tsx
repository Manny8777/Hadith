// One item of a collection or a note, as a line: a hadith (book, numbers, its opening), a narrator, a
// saved search or a comparison — linking to it. Server- and client-safe.
import Link from '@/app/components/Link'
import type { LibraryItem } from '@/lib/library'

export function itemHref(i: Pick<LibraryItem, 'kind' | 'ref'>) {
  if (i.kind === 'hadith') return `/hadith/${i.ref}`
  if (i.kind === 'narrator') return `/narrator/${i.ref}`
  if (i.kind === 'search') return `/search?${i.ref}`
  return `/compare?${i.ref}`
}

const KIND: Record<string, string> = { hadith: 'حديث', narrator: 'راوٍ', search: 'بحث محفوظ', compare: 'مقارنة' }

export default function ItemSummary({ item }: { item: LibraryItem }) {
  const h = item.hadith
  if (item.kind === 'hadith' && h) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs sm:text-[1.05rem] text-gray-500 font-sans">
          <span className="font-semibold text-green-800">{h.book}</span>
          {h.printed_number && <span>مطبوع {h.printed_number}</span>}
          {h.harf_number && <span>· حرف {h.harf_number}</span>}
          {h.part && h.page ? <span>· ج{h.part} ص{h.page}</span> : null}
        </div>
        <Link href={itemHref(item)} className="block mt-0.5 text-[0.95rem] sm:text-[1.3rem] leading-relaxed text-gray-900 hover:text-green-800 line-clamp-2">
          {h.tarf?.trim() || item.label || `حديث ${item.ref}`}
        </Link>
      </div>
    )
  }
  if (item.kind === 'narrator') {
    return (
      <div className="min-w-0">
        <div className="text-xs sm:text-[1.05rem] text-gray-500 font-sans">{item.narrator?.title ?? KIND.narrator}{item.narrator?.death ? ` · ت ${item.narrator.death}` : ''}</div>
        <Link href={itemHref(item)} className="block mt-0.5 text-[0.95rem] sm:text-[1.3rem] text-gray-900 hover:text-green-800">{item.narrator?.name ?? item.label ?? `راوٍ ${item.ref}`}</Link>
      </div>
    )
  }
  const q = item.kind === 'search' ? new URLSearchParams(item.ref).get('q') : null
  return (
    <div className="min-w-0">
      <div className="text-xs sm:text-[1.05rem] text-gray-500 font-sans">{KIND[item.kind]}</div>
      <Link href={itemHref(item)} className="block mt-0.5 text-[0.95rem] sm:text-[1.3rem] text-gray-900 hover:text-green-800 truncate">
        {item.label || (q ? `«${q}»` : item.ref)}
      </Link>
    </div>
  )
}

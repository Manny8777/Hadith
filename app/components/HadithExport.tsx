'use client'
import { useState } from 'react'

interface NarratorInChain {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  tabaqa: string | null
  death_year_num: number | null
}

interface Judgment {
  say_text: string
  scientist_name: string | null
  grade_class: string | null
}

interface HadithInfo {
  main_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  section_text: string | null
  chapter_text: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  tarf: string | null
}

interface TakhrijSummary {
  mutabaatCount: number
  shawahidCount: number
}

interface Props {
  hadith: HadithInfo
  chain: NarratorInChain[]
  takhrijBooks: string[]
  takhrijSummary?: TakhrijSummary
  judgments?: Judgment[]
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildCitation(
  hadith: HadithInfo,
  chain: NarratorInChain[],
  takhrijBooks: string[],
  takhrijSummary: TakhrijSummary | undefined,
  judgments: Judgment[]
): string {
  const lines: string[] = []
  const divider = '─'.repeat(50)

  lines.push('التوثيق الأكاديمي للحديث النبوي الشريف')
  lines.push(divider)

  // Source reference
  let ref = hadith.book_title
  if (hadith.takhrij_author) ref += `، ${hadith.takhrij_author}`
  if (hadith.takhrij_death) ref += ` (ت ${hadith.takhrij_death} هـ)`
  lines.push(`المصدر: ${ref}`)

  // Location
  const loc: string[] = []
  if (hadith.section_text?.trim()) loc.push(hadith.section_text.trim())
  if (hadith.chapter_text?.trim()) loc.push(hadith.chapter_text.trim())
  if (loc.length > 0) lines.push('الكتاب/الباب: ' + loc.join(' — '))
  if (hadith.part_num > 0 || hadith.page_num > 0) {
    const parts: string[] = []
    if (hadith.part_num > 0) parts.push(`الجزء ${hadith.part_num}`)
    if (hadith.page_num > 0) parts.push(`الصفحة ${hadith.page_num}`)
    lines.push(parts.join('، '))
  }
  const num = hadith.tarqeem_harf?.trim() || hadith.tarqeem_matboa1?.trim()
  if (num) lines.push(`رقم الحديث: ${num}`)

  // Hadith text excerpt
  if (hadith.tarf) {
    const text = stripTags(hadith.tarf).slice(0, 300)
    lines.push('')
    lines.push('طرف الحديث:')
    lines.push(`"${text}${stripTags(hadith.tarf).length > 300 ? '...' : ''}"`)
  }

  // Isnad chain
  if (chain.length > 0) {
    lines.push('')
    lines.push('رجال السند:')
    chain.forEach((n, i) => {
      const grade = n.martaba_ibn_hajar ? ` [${n.martaba_ibn_hajar}]` : ''
      const suffix = n.is_companion ? ' (صحابي)' : ''
      const tabaqa = n.tabaqa ? ` {${n.tabaqa.split('،')[0].trim()}}` : ''
      const death = n.death_year_num ? ` (ت ${n.death_year_num} هـ)` : ''
      lines.push(`  ${i + 1}. ${n.name}${grade}${suffix}${tabaqa}${death}`)
    })
    // Chain assessment
    const hasWeak = chain.some(n => n.martaba_ibn_hajar && /ضعيف|منكر|متروك|كذاب/.test(n.martaba_ibn_hajar))
    const allStrong = chain.every(n => !n.martaba_ibn_hajar || /ثقة|ثبت|حجة|عدل|صحابي|صدوق|مقبول/.test(n.martaba_ibn_hajar))
    if (hasWeak) lines.push('  ⚠ السند: يوجد راوٍ ضعيف في السند')
    else if (allStrong) lines.push('  ✓ السند: جميع رجاله ثقات')
  }

  // Scholarly judgments
  if (judgments.length > 0) {
    lines.push('')
    lines.push('أحكام العلماء على الحديث:')
    const grades: Record<string, number> = {}
    judgments.forEach(j => { if (j.grade_class) grades[j.grade_class] = (grades[j.grade_class] || 0) + 1 })
    if (Object.keys(grades).length > 0) {
      const summary = Object.entries(grades).map(([g, c]) => `${g} (${c})`).join(' — ')
      lines.push(`  خلاصة: ${summary}`)
    }
    lines.push('')
    judgments.slice(0, 15).forEach(j => {
      const scientist = j.scientist_name ? `${j.scientist_name}: ` : ''
      const grade = j.grade_class ? `[${j.grade_class}] ` : ''
      lines.push(`  • ${grade}${scientist}${j.say_text}`)
    })
  }

  // Takhrij with mutabaat/shawahid breakdown
  const totalTakhrij = takhrijBooks.length
  if (totalTakhrij > 0) {
    lines.push('')
    lines.push('التخريج:')
    if (takhrijSummary && (takhrijSummary.mutabaatCount > 0 || takhrijSummary.shawahidCount > 0)) {
      if (takhrijSummary.mutabaatCount > 0) lines.push(`  المتابعات: ${takhrijSummary.mutabaatCount} متابعة (نفس الصحابي — طرق مختلفة)`)
      if (takhrijSummary.shawahidCount > 0) lines.push(`  الشواهد: ${takhrijSummary.shawahidCount} شاهد (صحابة مختلفون)`)
    }
    lines.push(`  يوجد في: ${takhrijBooks.join(' — ')}`)
  }

  lines.push('')
  lines.push(divider)
  lines.push('مُستخرج من موسوعة خادم الحرمين الشريفين للحديث النبوي')

  return lines.join('\n')
}

function buildBibTeX(
  hadith: HadithInfo,
  chain: NarratorInChain[]
): string {
  // Build citekey: author_death_hadith_id
  const authorSlug = (hadith.takhrij_author || hadith.book_title)
    .replace(/\s+/g, '_')
    .replace(/[^\w؀-ۿ_]/g, '')
    .slice(0, 20)
  const citekey = `hadith_${authorSlug}_${hadith.main_id}`

  const fields: string[] = []

  fields.push(`  author    = {${hadith.takhrij_author || hadith.book_title}}`)
  fields.push(`  title     = {${hadith.book_title}}`)

  if (hadith.section_text?.trim() || hadith.chapter_text?.trim()) {
    const chapter = [hadith.section_text?.trim(), hadith.chapter_text?.trim()].filter(Boolean).join(' — ')
    fields.push(`  chapter   = {${chapter}}`)
  }

  if (hadith.part_num > 0) fields.push(`  volume    = {${hadith.part_num}}`)
  if (hadith.page_num > 0) fields.push(`  pages     = {${hadith.page_num}}`)

  const num = hadith.tarqeem_harf?.trim() || hadith.tarqeem_matboa1?.trim()
  if (num) fields.push(`  number    = {${num}}`)

  if (hadith.takhrij_death) {
    // Convert hijri to approximate gregorian for year field
    const gregorian = Math.round(hadith.takhrij_death - hadith.takhrij_death / 33)
    fields.push(`  year      = {${hadith.takhrij_death} هـ / ${gregorian} م}`)
  }

  fields.push(`  language  = {arabic}`)
  fields.push(`  note      = {حديث رقم ${hadith.main_id} — موسوعة خادم الحرمين الشريفين للحديث النبوي}`)

  if (chain.length > 0) {
    const companion = chain.find(n => n.is_companion)
    if (companion) fields.push(`  howpublished = {من حديث ${companion.name}}`)
  }

  return `@book{${citekey},\n${fields.join(',\n')}\n}`
}

function buildFootnote(hadith: HadithInfo, chain: NarratorInChain[]): string {
  // Standard Arabic academic footnote format:
  // رواه [Author] في [Book]، [vol/page]، رقم [number]، من حديث [companion].
  const parts: string[] = []

  const companion = chain.find(n => n.is_companion)
  const companionText = companion ? ` من حديث ${companion.name}` : ''

  let source = hadith.book_title
  if (hadith.takhrij_author) source = `${hadith.takhrij_author} في ${hadith.book_title}`

  const volPage: string[] = []
  if (hadith.part_num > 0) volPage.push(`ج${hadith.part_num}`)
  if (hadith.page_num > 0) volPage.push(`ص${hadith.page_num}`)
  const loc = volPage.join('/')

  const num = hadith.tarqeem_harf?.trim() || hadith.tarqeem_matboa1?.trim()

  let footnote = `رواه ${source}`
  if (loc) footnote += `، ${loc}`
  if (num) footnote += `، رقم ${num}`
  if (companionText) footnote += companionText
  footnote += '.'

  if (hadith.takhrij_death) {
    footnote += ` (${hadith.takhrij_author || ''} ت ${hadith.takhrij_death} هـ)`
  }

  parts.push(footnote)
  return parts.join('\n')
}

export default function HadithExport({ hadith, chain, takhrijBooks, takhrijSummary, judgments = [] }: Props) {
  const [copiedAr, setCopiedAr] = useState(false)
  const [copiedBib, setCopiedBib] = useState(false)
  const [copiedFn, setCopiedFn] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  async function handleCopyArabic() {
    const text = buildCitation(hadith, chain, takhrijBooks, takhrijSummary, judgments)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAr(true)
      setTimeout(() => setCopiedAr(false), 2000)
    } catch {
      window.prompt('نسخ التوثيق:', text)
    }
  }

  async function handleCopyBibTeX() {
    const text = buildBibTeX(hadith, chain)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedBib(true)
      setTimeout(() => setCopiedBib(false), 2000)
    } catch {
      window.prompt('BibTeX:', text)
    }
  }

  async function handleCopyFootnote() {
    const text = buildFootnote(hadith, chain)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFn(true)
      setTimeout(() => setCopiedFn(false), 2000)
    } catch {
      window.prompt('نسخ الهامش:', text)
    }
  }

  async function handleCopyLink() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      window.prompt('نسخ رابط الحديث:', url)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleCopyFootnote}
        className="text-xs text-blue-700 hover:text-blue-900 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors bg-blue-50 hover:bg-blue-100"
        title="نسخ توثيق الهامش — الصيغة المختصرة للأطروحات"
      >
        {copiedFn ? '✓ تم' : 'نسخ الهامش'}
      </button>
      <button
        onClick={handleCopyArabic}
        className="text-xs text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors bg-green-50 hover:bg-green-100"
      >
        {copiedAr ? '✓ تم النسخ' : 'نسخ التوثيق الأكاديمي'}
      </button>
      <button
        onClick={handleCopyBibTeX}
        className="text-xs text-purple-700 hover:text-purple-900 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-lg transition-colors bg-purple-50 hover:bg-purple-100 font-mono"
        title="نسخ مرجع BibTeX للاستخدام في LaTeX"
      >
        {copiedBib ? '✓ Copied' : 'BibTeX'}
      </button>
      <button
        onClick={handleCopyLink}
        className="text-xs text-gray-700 hover:text-green-800 border border-gray-200 hover:border-green-300 px-3 py-1.5 rounded-lg transition-colors bg-gray-50 hover:bg-green-50"
        title="نسخ رابط هذا الحديث"
      >
        {copiedLink ? '✓ تم نسخ الرابط' : 'نسخ رابط الحديث'}
      </button>
    </div>
  )
}

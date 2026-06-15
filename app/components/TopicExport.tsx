'use client'

import { useState } from 'react'

interface HadithCitation {
  main_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  tarf: string | null
  part_num: number
  page_num: number
  section_text: string | null
  chapter_text: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildArabicBibliography(topicTitle: string, hadiths: HadithCitation[]): string {
  const divider = '═'.repeat(60)
  const lines: string[] = [
    `المصادر الحديثية في موضوع: ${topicTitle}`,
    divider,
    '',
  ]

  hadiths.forEach((h, i) => {
    const author = h.takhrij_author || h.book_title
    const death = h.takhrij_death ? ` (ت ${h.takhrij_death} هـ)` : ''
    const num = h.tarqeem_harf?.trim() || h.tarqeem_matboa1?.trim()
    const vol = h.part_num > 0 ? `ج${h.part_num}` : ''
    const pg = h.page_num > 0 ? `ص${h.page_num}` : ''
    const loc = [vol, pg].filter(Boolean).join(' ')
    const grade = h.grade_hint ? ` [${h.grade_hint}]` : ''

    lines.push(`${i + 1}. ${author}${death}، ${h.book_title}${grade}`)
    if (num || loc) {
      lines.push(`   ${[num ? `رقم ${num}` : '', loc].filter(Boolean).join('، ')}`)
    }
    if (h.tarf) {
      lines.push(`   "${stripTags(h.tarf).slice(0, 100)}..."`)
    }
    lines.push('')
  })

  lines.push(divider)
  lines.push('مُستخرج من موسوعة خادم الحرمين الشريفين للحديث النبوي')
  return lines.join('\n')
}

function buildBibTeX(topicTitle: string, hadiths: HadithCitation[]): string {
  return hadiths.map(h => {
    const slug = (h.takhrij_author || h.book_title)
      .replace(/\s+/g, '_').replace(/[^\w؀-ۿ_]/g, '').slice(0, 20)
    const key = `hadith_${slug}_${h.main_id}`
    const num = h.tarqeem_harf?.trim() || h.tarqeem_matboa1?.trim()
    const fields = [
      `  author    = {${h.takhrij_author || h.book_title}}`,
      `  title     = {${h.book_title}}`,
      `  note      = {موضوع: ${topicTitle}${h.grade_hint ? ' — ' + h.grade_hint : ''}}`,
      h.part_num > 0 ? `  volume    = {${h.part_num}}` : null,
      h.page_num > 0 ? `  pages     = {${h.page_num}}` : null,
      num ? `  number    = {${num}}` : null,
      h.takhrij_death ? `  year      = {${h.takhrij_death} هـ}` : null,
      `  language  = {arabic}`,
    ].filter(Boolean).join(',\n')
    return `@book{${key},\n${fields}\n}`
  }).join('\n\n')
}

export default function TopicExport({
  topicId,
  topicTitle,
}: {
  topicId: number
  topicTitle: string
}) {
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'arabic' | 'bibtex' | null>(null)
  const [copied, setCopied] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  async function exportCitations(fmt: 'arabic' | 'bibtex') {
    setLoading(true)
    try {
      const res = await fetch(`/api/topics/item/${topicId}/export`)
      const data = await res.json()
      const hadiths: HadithCitation[] = data.hadiths || []
      setCount(hadiths.length)
      const text = fmt === 'arabic'
        ? buildArabicBibliography(topicTitle, hadiths)
        : buildBibTeX(topicTitle, hadiths)
      try {
        await navigator.clipboard.writeText(text)
        setMode(fmt)
        setCopied(true)
        setTimeout(() => { setCopied(false); setMode(null) }, 3000)
      } catch {
        window.prompt(fmt === 'arabic' ? 'نسخ القائمة:' : 'BibTeX:', text)
      }
    } catch {
      //
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-400">تصدير مصادر الموضوع:</span>
      <button
        onClick={() => exportCitations('arabic')}
        disabled={loading}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
          mode === 'arabic' && copied
            ? 'bg-green-700 text-white border-green-700'
            : 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
        }`}
      >
        {mode === 'arabic' && copied
          ? `✓ تم النسخ (${count} حديث)`
          : loading ? 'جاري التحميل...' : 'نسخ القائمة العربية'}
      </button>
      <button
        onClick={() => exportCitations('bibtex')}
        disabled={loading}
        className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors disabled:opacity-50 ${
          mode === 'bibtex' && copied
            ? 'bg-purple-700 text-white border-purple-700'
            : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
        }`}
      >
        {mode === 'bibtex' && copied ? `✓ Copied (${count})` : 'نسخ BibTeX'}
      </button>
    </div>
  )
}

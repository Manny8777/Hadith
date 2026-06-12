'use client'
import { useState } from 'react'

interface NarratorInChain {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
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

interface Props {
  hadith: HadithInfo
  chain: NarratorInChain[]
  takhrijBooks: string[]
}

function buildCitation(hadith: HadithInfo, chain: NarratorInChain[], takhrijBooks: string[]): string {
  const lines: string[] = []

  // Source reference
  let ref = hadith.book_title
  if (hadith.takhrij_author) ref += `، ${hadith.takhrij_author}`
  if (hadith.takhrij_death) ref += ` (ت ${hadith.takhrij_death} هـ)`
  lines.push(ref)

  // Location
  const loc: string[] = []
  if (hadith.section_text?.trim()) loc.push(hadith.section_text.trim())
  if (hadith.chapter_text?.trim()) loc.push(hadith.chapter_text.trim())
  if (loc.length > 0) lines.push('كتاب: ' + loc.join(' — '))
  if (hadith.part_num > 0 || hadith.page_num > 0) {
    const parts: string[] = []
    if (hadith.part_num > 0) parts.push(`ج${hadith.part_num}`)
    if (hadith.page_num > 0) parts.push(`ص${hadith.page_num}`)
    lines.push(parts.join('، '))
  }
  if (hadith.tarqeem_harf?.trim()) lines.push(`رقم الحديث: ${hadith.tarqeem_harf.trim()}`)

  // Isnad chain
  if (chain.length > 0) {
    lines.push('')
    lines.push('رجال السند:')
    chain.forEach((n, i) => {
      const grade = n.martaba_ibn_hajar ? ` [${n.martaba_ibn_hajar}]` : ''
      const suffix = n.is_companion ? ' (صحابي)' : ''
      lines.push(`  ${i + 1}. ${n.name}${grade}${suffix}`)
    })
  }

  // Takhrij
  if (takhrijBooks.length > 0) {
    lines.push('')
    lines.push('التخريج — يوجد أيضاً في:')
    lines.push('  ' + takhrijBooks.join(' — '))
  }

  return lines.join('\n')
}

export default function HadithExport({ hadith, chain, takhrijBooks }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const text = buildCitation(hadith, chain, takhrijBooks)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('نسخ التوثيق:', text)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors bg-green-50 hover:bg-green-100"
    >
      {copied ? '✓ تم النسخ' : 'نسخ التوثيق'}
    </button>
  )
}

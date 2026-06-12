'use client'
import { useState } from 'react'

interface NarratorInfo {
  name: string
  abb_name: string | null
  kunia: string | null
  laqab: string | null
  nasab: string | null
  tabaqa: string | null
  birth_year: string | null
  death_year: string | null
  birth_city: string | null
  death_city: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
}

interface CriticismEntry { text: string; garh_label: string | null }
interface CriticismItem {
  scientist_name: string
  entries: CriticismEntry[]
}

interface BiographyBook {
  book_name: string
}

interface GradeStat {
  garh_label: string
  cnt: number
}

function buildResearchText(
  narrator: NarratorInfo,
  criticism: CriticismItem[],
  biographies: BiographyBook[],
  gradeStats: GradeStat[],
  booksCount: number,
  teachersCount: number,
  studentsCount: number
): string {
  const lines: string[] = []

  lines.push('الراوي: ' + narrator.name)
  if (narrator.abb_name && narrator.abb_name !== narrator.name)
    lines.push('الاسم المختصر: ' + narrator.abb_name)
  if (narrator.kunia?.trim()) lines.push('الكنية: ' + narrator.kunia)
  if (narrator.laqab?.trim()) lines.push('اللقب: ' + narrator.laqab)
  if (narrator.nasab?.trim()) lines.push('النسب: ' + narrator.nasab)
  if (narrator.tabaqa?.trim()) lines.push('الطبقة: ' + narrator.tabaqa)
  if (narrator.birth_year?.trim()) lines.push('تاريخ الميلاد: ' + narrator.birth_year)
  if (narrator.birth_city?.trim()) lines.push('بلد الميلاد: ' + narrator.birth_city)
  if (narrator.death_year?.trim()) lines.push('تاريخ الوفاة: ' + narrator.death_year)
  if (narrator.death_city?.trim()) lines.push('بلد الوفاة: ' + narrator.death_city)
  if (narrator.is_companion) lines.push('الطبقة: صحابي')

  lines.push('')
  lines.push('الحكم على الراوي:')
  if (narrator.martaba_ibn_hajar) lines.push('  ابن حجر في تقريب التهذيب: ' + narrator.martaba_ibn_hajar)
  if (narrator.martaba_zahabi) lines.push('  الذهبي في الكاشف: ' + narrator.martaba_zahabi)

  if (gradeStats.length > 0) {
    lines.push('')
    lines.push('خلاصة الحكم:')
    lines.push('  ' + gradeStats.map(g => g.garh_label + (g.cnt > 1 ? ` (${g.cnt} عالم)` : '')).join(' ، '))
  }

  if (criticism.length > 0) {
    lines.push('')
    lines.push('أقوال العلماء في الراوي:')
    for (const c of criticism) {
      lines.push('  ' + c.scientist_name + ':')
      for (const e of c.entries) {
        const label = e.garh_label ? `[${e.garh_label}] ` : ''
        lines.push('    ' + label + '"' + e.text + '"')
      }
    }
  }

  if (biographies.length > 0) {
    lines.push('')
    lines.push('المصادر الترجمية:')
    lines.push('  ' + biographies.map(b => b.book_name).join(' — '))
  }

  if (booksCount > 0) lines.push('')
  if (booksCount > 0) lines.push('يروي في ' + booksCount + ' كتاباً')
  if (teachersCount > 0) lines.push('شيوخه: ' + teachersCount + ' شيخ')
  if (studentsCount > 0) lines.push('تلاميذه: ' + studentsCount + ' تلميذ')

  return lines.join('\n')
}

export default function NarratorExport({
  narrator,
  criticism,
  biographies,
  gradeStats,
  booksCount,
  teachersCount,
  studentsCount,
}: {
  narrator: NarratorInfo
  criticism: CriticismItem[]
  biographies: BiographyBook[]
  gradeStats: GradeStat[]
  booksCount: number
  teachersCount: number
  studentsCount: number
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const text = buildResearchText(narrator, criticism, biographies, gradeStats, booksCount, teachersCount, studentsCount)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: show in alert
      window.prompt('نسخ النص:', text)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-lg transition-colors bg-amber-50 hover:bg-amber-100"
    >
      {copied ? '✓ تم النسخ' : 'نسخ للبحث'}
    </button>
  )
}

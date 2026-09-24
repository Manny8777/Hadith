'use client'

import { useMemo, useState } from 'react'
import ReportPrintButton, { type PrintableReport } from '@/app/components/ReportPrintButton'
import { downloadUtf8TextFile } from '@/lib/downloadTextFile'

interface NarratorInfo {
  id?: number
  name: string
  abb_name: string | null
  esm_shuhra?: string | null
  kunia: string | null
  laqab: string | null
  nasab: string | null
  tabaqa: string | null
  birth_year: string | null
  death_year: string | null
  birth_city: string | null
  death_city: string | null
  living_city?: string | null
  journey_city?: string | null
  journey_date?: string | null
  mazhb?: string | null
  selat_karaba?: string | null
  user_comments?: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
}

interface CriticismEntry {
  text: string
  garh_label: string | null
}

interface CriticismItem {
  scientist_name: string
  entries: CriticismEntry[]
}

interface BiographyEntry {
  title?: string
  content: string
  part_num?: number | null
  page_num?: number | null
}

interface BiographyBook {
  book_name: string
  entries?: BiographyEntry[]
}

interface GradeStat {
  garh_label: string
  cnt: number
}

type Notice = { kind: 'success' | 'warning' | 'error'; text: string }

const MAX_CRITICISM_GROUPS = 100
const MAX_CRITICISM_ENTRIES = 200
const MAX_BIOGRAPHY_BOOKS = 20
const MAX_BIOGRAPHY_ENTRIES_PER_BOOK = 5
const MAX_BIOGRAPHY_EXCERPT_LENGTH = 2_000
const MAX_LONG_FIELD_LENGTH = 2_000

function plainText(value: string | null | undefined): string {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function boundedText(value: string | null | undefined, maxLength: number): string {
  const text = plainText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}… [مقتطف]` : text
}

function addField(lines: string[], label: string, value: string | null | undefined) {
  const text = boundedText(value, MAX_LONG_FIELD_LENGTH)
  if (text) lines.push(`${label}: ${text}`)
}

function buildResearchText(
  narrator: NarratorInfo,
  criticism: CriticismItem[],
  biographies: BiographyBook[],
  gradeStats: GradeStat[],
  booksCount: number,
  teachersCount: number,
  studentsCount: number,
): string {
  const narratorName = boundedText(narrator.name, 200)
  const lines: string[] = [
    `تقرير بحثي عن الراوي: ${narratorName}`,
    'موسوعة خادم الحرمين الشريفين للحديث النبوي',
    '═'.repeat(60),
    '',
    'بيانات التعريف',
  ]

  addField(lines, 'الاسم', narrator.name)
  if (narrator.abb_name && narrator.abb_name !== narrator.name) {
    addField(lines, 'الاسم المختصر', narrator.abb_name)
  }
  addField(lines, 'اشتهر بـ', narrator.esm_shuhra)
  addField(lines, 'الكنية', narrator.kunia)
  addField(lines, 'اللقب', narrator.laqab)
  addField(lines, 'النسب', narrator.nasab)
  addField(lines, 'الطبقة', narrator.tabaqa)
  addField(lines, 'تاريخ الميلاد', narrator.birth_year)
  addField(lines, 'بلد الميلاد', narrator.birth_city)
  addField(lines, 'تاريخ الوفاة', narrator.death_year)
  addField(lines, 'بلد الوفاة', narrator.death_city)
  addField(lines, 'بلد الإقامة', narrator.living_city)
  addField(lines, 'بلد الرحلة', narrator.journey_city)
  addField(lines, 'تاريخ الرحلة', narrator.journey_date)
  addField(lines, 'المذهب', narrator.mazhb)
  addField(lines, 'علاقات الراوي', narrator.selat_karaba)
  if (narrator.is_companion) lines.push('الطبقة: صحابي')

  lines.push('', 'الحكم على الراوي')
  addField(lines, 'ابن حجر في تقريب التهذيب', narrator.martaba_ibn_hajar)
  addField(lines, 'الذهبي في الكاشف', narrator.martaba_zahabi)

  if (gradeStats.length > 0) {
    lines.push('', 'خلاصة الحكم')
    lines.push(gradeStats.map((grade) => {
      const suffix = grade.cnt > 1 ? ` (${grade.cnt} عالم)` : ''
      return `${grade.garh_label}${suffix}`
    }).join(' ، '))
  }

  const includedCriticismGroups = criticism.slice(0, MAX_CRITICISM_GROUPS)
  let includedCriticismEntries = 0
  if (criticism.length > 0) {
    lines.push('', `أقوال العلماء في الراوي (${includedCriticismGroups.length} من ${criticism.length} مصدرًا في البيانات المحمّلة)`)
    for (const critic of includedCriticismGroups) {
      lines.push('', `${critic.scientist_name}:`)
      for (const entry of critic.entries) {
        if (includedCriticismEntries >= MAX_CRITICISM_ENTRIES) break
        if (!plainText(entry.text)) continue
        const label = entry.garh_label ? `[${entry.garh_label}] ` : ''
        lines.push(`  ${label}"${boundedText(entry.text, 1_500)}"`)
        includedCriticismEntries++
      }
      if (includedCriticismEntries >= MAX_CRITICISM_ENTRIES) break
    }
  }

  const includedBiographies = biographies.slice(0, MAX_BIOGRAPHY_BOOKS)
  let omittedBiographyEntries = 0
  if (biographies.length > 0) {
    lines.push('', `المصادر الترجمية (${includedBiographies.length} من ${biographies.length} مصدرًا في البيانات المحمّلة)`)
    for (const biography of includedBiographies) {
      lines.push('', `• ${biography.book_name}`)
      const entries = (biography.entries || []).slice(0, MAX_BIOGRAPHY_ENTRIES_PER_BOOK)
      for (const entry of entries) {
        const citation = [entry.part_num ? `الجزء ${entry.part_num}` : '', entry.page_num ? `الصفحة ${entry.page_num}` : '']
          .filter(Boolean)
          .join('، ')
        if (entry.title && plainText(entry.title) !== plainText(biography.book_name)) {
          lines.push(`  ${boundedText(entry.title, 300)}`)
        }
        if (citation) lines.push(`  (${citation})`)
        lines.push(`  ${boundedText(entry.content, MAX_BIOGRAPHY_EXCERPT_LENGTH)}`)
      }
      if ((biography.entries || []).length > entries.length) {
        omittedBiographyEntries += (biography.entries || []).length - entries.length
        lines.push('  [مقتطفات إضافية من هذا المصدر غير مدرجة في هذا التقرير.]')
      }
    }
  }

  lines.push('', 'ملخص الرواية')
  lines.push(`كتب محمّلة في هذه الصفحة: ${booksCount}`)
  lines.push(`شيوخه ضمن البيانات المحمّلة: ${teachersCount}`)
  lines.push(`تلاميذه ضمن البيانات المحمّلة: ${studentsCount}`)

  if (narrator.user_comments && plainText(narrator.user_comments)) {
    lines.push('', 'ملاحظات المحرر')
    lines.push(boundedText(narrator.user_comments, MAX_LONG_FIELD_LENGTH))
  }

  const scopeWarnings: string[] = []
  if (criticism.length > MAX_CRITICISM_GROUPS) {
    scopeWarnings.push(`اقتصرت أقوال العلماء على ${formatCount(MAX_CRITICISM_GROUPS)} من ${formatCount(criticism.length)} مصدرًا.`)
  }
  if (includedCriticismEntries >= MAX_CRITICISM_ENTRIES) {
    scopeWarnings.push(`اقتصر التقرير على ${formatCount(MAX_CRITICISM_ENTRIES)} اقتباس حرج وتعديل.`)
  }
  if (biographies.length > MAX_BIOGRAPHY_BOOKS) {
    scopeWarnings.push(`اقتصرت المصادر الترجمية على ${formatCount(MAX_BIOGRAPHY_BOOKS)} من ${formatCount(biographies.length)} مصدرًا.`)
  }
  if (omittedBiographyEntries > 0) {
    scopeWarnings.push(`اقتصر التقرير على ${formatCount(MAX_BIOGRAPHY_ENTRIES_PER_BOOK)} مقتطفات لكل مصدر ترجمي، وتم حذف ${formatCount(omittedBiographyEntries)} مقتطفاً إضافياً.`)
  }
  scopeWarnings.push('تقتصر قوائم الشيوخ والتلاميذ على ما هو محمّل في هذه الصفحة، ولا يفترض أن هذا التقرير شامل.')

  lines.push('', 'حدود التقرير')
  for (const warning of scopeWarnings) lines.push(`• ${warning}`)
  lines.push('', 'مُستخرج من موسوعة خادم الحرمين الشريفين للحديث النبوي')

  return lines.join('\n')
}

const arabicNumbers = new Intl.NumberFormat('ar-SA')

function formatCount(value: number): string {
  return arabicNumbers.format(value)
}

function buildFilename(narrator: NarratorInfo): string {
  const identity = narrator.id ? `تقرير-الراوي-${narrator.id}` : `تقرير-الراوي-${narrator.name}`
  return `${identity}.txt`
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
  const [busyAction, setBusyAction] = useState<'copy' | 'download' | null>(null)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const text = useMemo(
    () => buildResearchText(narrator, criticism, biographies, gradeStats, booksCount, teachersCount, studentsCount),
    [narrator, criticism, biographies, gradeStats, booksCount, teachersCount, studentsCount],
  )
  const report = useMemo<PrintableReport>(() => ({
    title: `تقرير الراوي: ${narrator.name}`,
    subtitle: 'موسوعة خادم الحرمين الشريفين للحديث النبوي',
    text,
  }), [narrator.name, text])

  async function handleCopy() {
    setBusyAction('copy')
    setNotice(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
      setNotice({ kind: 'success', text: 'تم نسخ التقرير البحثي.' })
    } catch {
      try {
        const displayed = window.prompt('نسخ التقرير:', text)
        setNotice(displayed === null
          ? { kind: 'warning', text: 'أُلغي فتح نافذة النسخ. لم يُنسخ أي محتوى.' }
          : { kind: 'warning', text: 'تم عرض التقرير للنسخ اليدوي؛ لم يتم تأكيد النسخ التلقائي.' })
      } catch {
        setNotice({ kind: 'error', text: 'تعذر نسخ التقرير. لم يُنسخ أي محتوى.' })
      }
    } finally {
      setBusyAction(null)
    }
  }

  function handleDownload() {
    setBusyAction('download')
    setNotice(null)
    try {
      downloadUtf8TextFile(buildFilename(narrator), text)
      setNotice({ kind: 'success', text: `تم تنزيل التقرير كملف UTF-8 بصيغة TXT (${formatCount(text.length)} محرف).` })
    } catch {
      setNotice({ kind: 'error', text: 'تعذر تنزيل التقرير. لم يُنشأ ملف.' })
    } finally {
      setBusyAction(null)
    }
  }

  const busy = busyAction !== null

  return (
    <div className="space-y-2" dir="rtl" aria-busy={busy}>
      <div className="no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={busy}
          aria-busy={busyAction === 'copy'}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === 'copy' ? 'جاري النسخ...' : copied ? '✓ تم النسخ' : 'نسخ للبحث'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          aria-busy={busyAction === 'download'}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-green-200 bg-green-50 px-3 py-2 font-sans text-xs text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === 'download' ? 'جاري التنزيل...' : 'تنزيل TXT'}
        </button>
        <ReportPrintButton
          report={report}
          disabled={busy}
          onStatus={(message, kind) => setNotice({ kind, text: message })}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`max-w-xl text-xs leading-relaxed ${
          notice?.kind === 'error' ? 'text-red-700' : notice?.kind === 'success' ? 'text-green-700' : 'text-amber-700'
        }`}
      >
        {notice?.text || ''}
      </p>
    </div>
  )
}

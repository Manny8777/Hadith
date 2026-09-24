'use client'

import { useState } from 'react'
import ReportPrintButton, { type PrintableReport } from '@/app/components/ReportPrintButton'
import { downloadUtf8TextFile } from '@/lib/downloadTextFile'

interface HadithCitation {
  main_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  tarf: string | null
  part_num: number | null
  page_num: number | null
  section_text: string | null
  chapter_text: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
}

interface TopicExportResponse {
  error?: string
  item?: {
    id?: unknown
    title?: unknown
  }
  hadiths?: unknown
  total?: unknown
  distinct_linked_associations?: unknown
  exportable_resolved_rows?: unknown
  returned_rows?: unknown
  unresolved_associations?: unknown
  truncated?: unknown
  pagination?: {
    limit?: unknown
    offset?: unknown
    has_more?: unknown
    next_offset?: unknown
  }
}

interface LoadedTopicReport {
  report: PrintableReport
  topicTitle: string
  hadiths: HadithCitation[]
  warning: string | null
  returnedRows: number
}

interface TopicExportProps {
  topicId: number
  topicTitle: string
}

type ExportMode = 'arabic' | 'bibtex'
type ExportAction = ExportMode | 'download'
type Notice = { kind: 'success' | 'warning' | 'error'; text: string }

function isHadithCitation(value: unknown): value is HadithCitation {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.main_id === 'number'
    && typeof row.book_title === 'string'
    && (row.takhrij_author === null || typeof row.takhrij_author === 'string')
    && (row.takhrij_death === null || typeof row.takhrij_death === 'number')
    && (row.tarf === null || typeof row.tarf === 'string')
    && (row.part_num === null || typeof row.part_num === 'number')
    && (row.page_num === null || typeof row.page_num === 'number')
    && (row.section_text === null || typeof row.section_text === 'string')
    && (row.chapter_text === null || typeof row.chapter_text === 'string')
    && (row.tarqeem_harf === null || typeof row.tarqeem_harf === 'string')
    && (row.tarqeem_matboa1 === null || typeof row.tarqeem_matboa1 === 'string')
    && (row.grade_hint === null || typeof row.grade_hint === 'string')
}

function numberAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

const arabicNumbers = new Intl.NumberFormat('ar-SA')
const EXPORT_PAGE_LIMIT = 200
const EXPORT_REQUEST_TIMEOUT_MS = 15_000

function formatCount(value: number): string {
  return arabicNumbers.format(value)
}

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildScopeWarning(data: TopicExportResponse): string | null {
  if (data.truncated !== true && !(numberAtLeast(data.unresolved_associations, 0) && data.unresolved_associations > 0)) {
    return null
  }

  const parts: string[] = []
  if (data.truncated === true) {
    parts.push(
      `نسخة محدودة: تضم ${formatCount(data.returned_rows as number)} من ${formatCount(data.exportable_resolved_rows as number)} مصدراً قابلاً للتصدير؛ وهي الصفحة الأولى فقط (الحد الأقصى ${formatCount(EXPORT_PAGE_LIMIT)} مصدر)، ولم يُجلب ما بعدها، لذلك هذه القائمة ليست كاملة.`,
    )
  }
  if (numberAtLeast(data.unresolved_associations, 0) && data.unresolved_associations > 0) {
    parts.push(
      `لا يمكن تصدير ${formatCount(data.unresolved_associations)} ارتباطاً غير محلول من أصل ${formatCount(data.distinct_linked_associations as number)} ارتباطاً مرتبطاً بالموضوع.`,
    )
  }
  return parts.join(' ')
}

function buildReportSubtitle(data: TopicExportResponse): string {
  if (data.truncated === true) {
    return `نسخة موضوعية محدودة: ${formatCount(data.returned_rows as number)} من ${formatCount(data.exportable_resolved_rows as number)} مصدراً قابلاً للتصدير`
  }
  if (numberAtLeast(data.unresolved_associations, 0) && data.unresolved_associations > 0) {
    return `المصادر القابلة للتصدير مع ${formatCount(data.unresolved_associations)} ارتباطاً غير محلول`
  }
  return 'المصادر الحديثية في الموضوع'
}

function buildArabicBibliography(
  topicTitle: string,
  hadiths: HadithCitation[],
  data: TopicExportResponse,
): string {
  const divider = '═'.repeat(60)
  const lines: string[] = [
    `المصادر الحديثية في موضوع: ${topicTitle}`,
    buildReportSubtitle(data),
    divider,
  ]

  const scopeWarning = buildScopeWarning(data)
  if (scopeWarning) {
    lines.push(`تنبيه حدود التقرير: ${scopeWarning}`)
    lines.push('')
  } else {
    lines.push('نطاق التقرير: جميع المصادر القابلة للتصدير التي احتوتها استجابة خدمة التصدير.')
    lines.push('')
  }

  hadiths.forEach((hadith, index) => {
    const author = hadith.takhrij_author || hadith.book_title
    const death = hadith.takhrij_death ? ` (ت ${hadith.takhrij_death} هـ)` : ''
    const number = hadith.tarqeem_harf?.trim() || hadith.tarqeem_matboa1?.trim()
    const volume = hadith.part_num != null && hadith.part_num > 0 ? `ج${hadith.part_num}` : ''
    const page = hadith.page_num != null && hadith.page_num > 0 ? `ص${hadith.page_num}` : ''
    const location = [volume, page].filter(Boolean).join(' ')
    const grade = hadith.grade_hint ? ` [${hadith.grade_hint}]` : ''

    lines.push(`${index + 1}. ${author}${death}، ${hadith.book_title}${grade}`)
    if (number || location) {
      lines.push(`   ${[number ? `رقم ${number}` : '', location].filter(Boolean).join('، ')}`)
    }
    if (hadith.tarf) {
      const excerpt = stripTags(hadith.tarf)
      lines.push(`   "${excerpt.length > 100 ? `${excerpt.slice(0, 100).trimEnd()}...` : excerpt}"`)
    }
    lines.push('')
  })

  lines.push(divider)
  lines.push(`عدد المصادر القابلة للتصدير في هذا الموضوع: ${formatCount(data.exportable_resolved_rows as number)}`)
  lines.push(`عدد المصادر المحتواة في هذه النسخة: ${formatCount(data.returned_rows as number)}`)
  if (scopeWarning) lines.push(`تنبيه: ${scopeWarning}`)
  lines.push('مُستخرج من موسوعة خادم الحرمين الشريفين للحديث النبوي')
  return lines.join('\n')
}

function escapeBibTeX(value: string): string {
  return value
    .replace(/[{}]/g, '')
    .replace(/[\\$%&#_]/g, '\\$&')
    .replace(/\r?\n/g, ' ')
    .trim()
}

function buildBibTeX(topicTitle: string, hadiths: HadithCitation[], warning: string | null): string {
  const warningLines = warning
    ? [`% تنبيه حدود القائمة: ${warning}`, '']
    : ['']
  const entries = hadiths.map((hadith) => {
    const source = hadith.takhrij_author || hadith.book_title
    const slug = source.replace(/\s+/g, '_').replace(/[^\w؀-ۿ_]/g, '').slice(0, 20)
    const key = `hadith_${slug}_${hadith.main_id}`
    const number = hadith.tarqeem_harf?.trim() || hadith.tarqeem_matboa1?.trim()
    const fields = [
      `  author    = {${escapeBibTeX(source)}}`,
      `  title     = {${escapeBibTeX(hadith.book_title)}}`,
      `  note      = {موضوع: ${escapeBibTeX(topicTitle)}${hadith.grade_hint ? ` — ${escapeBibTeX(hadith.grade_hint)}` : ''}}`,
      hadith.part_num != null && hadith.part_num > 0 ? `  volume    = {${hadith.part_num}}` : null,
      hadith.page_num != null && hadith.page_num > 0 ? `  pages     = {${hadith.page_num}}` : null,
      number ? `  number    = {${escapeBibTeX(number)}}` : null,
      hadith.takhrij_death ? `  year      = {${hadith.takhrij_death} هـ}` : null,
      '  language  = {arabic}',
    ].filter(Boolean).join(',\n')
    return `@book{${key},\n${fields}\n}`
  }).join('\n\n')

  return [...warningLines, entries].join('\n').trim()
}

function errorMessageForStatus(status: number): string {
  if (status === 404) return 'الموضوع المطلوب غير موجود.'
  if (status === 400) return 'معرّف الموضوع أو معايير التصفح غير صالحة.'
  return 'تعذر تصدير المصادر الآن. لم يتم نسخ أي محتوى.'
}

export default function TopicExport({ topicId, topicTitle }: TopicExportProps) {
  const [loading, setLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<ExportAction | null>(null)
  const [mode, setMode] = useState<ExportMode | null>(null)
  const [copied, setCopied] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [report, setReport] = useState<PrintableReport | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function loadBoundedReport(): Promise<LoadedTopicReport | null> {
    setLoading(true)
    setCount(null)
    setReport(null)
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), EXPORT_REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(`/api/topics/item/${topicId}/export?limit=${EXPORT_PAGE_LIMIT}&offset=0`, {
        signal: controller.signal,
      })

      if (!res.ok) {
        setNotice({ kind: 'error', text: errorMessageForStatus(res.status) })
        return null
      }

      let data: TopicExportResponse
      try {
        data = await res.json() as TopicExportResponse
      } catch {
        setNotice({ kind: 'error', text: 'تعذر قراءة استجابة تصدير المصادر. لم يتم نسخ أو تنزيل أي محتوى.' })
        return null
      }

      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        !Array.isArray(data.hadiths) ||
        !data.hadiths.every(isHadithCitation)
      ) {
        setNotice({ kind: 'error', text: 'استجابة التصدير غير صالحة. لم يتم نسخ أو تنزيل أي محتوى.' })
        return null
      }

      const hadiths = data.hadiths
      if (
        !numberAtLeast(data.distinct_linked_associations, 0) ||
        !numberAtLeast(data.exportable_resolved_rows, 0) ||
        !numberAtLeast(data.returned_rows, 0) ||
        !numberAtLeast(data.unresolved_associations, 0) ||
        typeof data.truncated !== 'boolean' ||
        data.returned_rows !== hadiths.length ||
        data.returned_rows > EXPORT_PAGE_LIMIT ||
        data.returned_rows !== Math.min(EXPORT_PAGE_LIMIT, data.exportable_resolved_rows) ||
        data.exportable_resolved_rows < data.returned_rows ||
        data.truncated !== (data.returned_rows < data.exportable_resolved_rows) ||
        data.distinct_linked_associations !==
          data.exportable_resolved_rows + data.unresolved_associations ||
        data.exportable_resolved_rows > data.distinct_linked_associations ||
        data.total !== data.returned_rows ||
        data.item?.id !== topicId ||
        typeof data.item?.title !== 'string' ||
        data.item.title.trim().length === 0 ||
        !data.pagination ||
        data.pagination.limit !== EXPORT_PAGE_LIMIT ||
        data.pagination.offset !== 0 ||
        data.pagination.has_more !== data.truncated ||
        data.pagination.next_offset !== (data.truncated ? data.returned_rows : null)
      ) {
        setNotice({ kind: 'error', text: 'بيانات التصدير غير مكاملة أو متعارضة. لم يتم نسخ أو تنزيل أي محتوى.' })
        return null
      }

      if (hadiths.length === 0) {
        setCount(0)
        setNotice(
          data.unresolved_associations > 0
            ? {
                kind: 'warning',
                text: `لا توجد مصادر قابلة للتصدير لهذا الموضوع. عدد الارتباطات غير المحلولة: ${formatCount(data.unresolved_associations)}.`,
              }
            : { kind: 'warning', text: 'لا توجد مصادر قابلة للتصدير لهذا الموضوع.' },
        )
        return null
      }

      setCount(data.returned_rows)
      const text = buildArabicBibliography(data.item.title, hadiths, data)
      const printableReport: PrintableReport = {
        title: `تقرير مصادر الموضوع: ${data.item.title}`,
        subtitle: buildReportSubtitle(data),
        text,
      }
      setReport(printableReport)
      return {
        report: printableReport,
        topicTitle: data.item.title,
        hadiths,
        warning: buildScopeWarning(data),
        returnedRows: data.returned_rows,
      }
    } catch {
      setNotice({ kind: 'error', text: 'تعذر الاتصال بخدمة التصدير أو انتهت مهلة الطلب. لم يتم نسخ أو تنزيل أو طباعة أي محتوى.' })
      return null
    } finally {
      window.clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  async function exportCitations(fmt: ExportMode) {
    setBusyAction(fmt)
    setCopied(false)
    setMode(null)
    const loaded = await loadBoundedReport()
    if (!loaded) {
      setBusyAction(null)
      return
    }

    const text = fmt === 'arabic'
      ? loaded.report.text
      : buildBibTeX(loaded.topicTitle, loaded.hadiths, loaded.warning)
    if (!text.trim()) {
      setNotice({ kind: 'warning', text: 'تعذر إنشاء نص صالح للنسخ من الاستجابة الحالية.' })
      setBusyAction(null)
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setMode(fmt)
      setCopied(true)
      setNotice(loaded.warning
        ? {
            kind: 'warning',
            text: `تم نسخ ${formatCount(loaded.returnedRows)} مصدر من الاستجابة المتاحة. ${loaded.warning}`,
          }
        : {
            kind: 'success',
            text: fmt === 'arabic' ? 'تم نسخ القائمة العربية.' : 'تم نسخ قائمة BibTeX.',
          })
      window.setTimeout(() => {
        setCopied(false)
        setMode(null)
      }, 3_000)
    } catch {
      try {
        window.prompt(fmt === 'arabic' ? 'نسخ القائمة:' : 'BibTeX:', text)
        setNotice(loaded.warning
          ? { kind: 'warning', text: `تم عرض ${formatCount(loaded.returnedRows)} مصدراً من القائمة المتاحة للنسخ اليدوي. ${loaded.warning}` }
          : { kind: 'warning', text: 'تم عرض القائمة للنسخ اليدوي؛ لم يتم تأكيد النسخ التلقائي.' })
      } catch {
        setNotice({ kind: 'error', text: 'تعذر نسخ المصادر. لم يُنسخ أي محتوى.' })
      }
    } finally {
      setBusyAction(null)
    }
  }

  async function downloadTopicReport() {
    setBusyAction('download')
    const loaded = await loadBoundedReport()
    if (!loaded) {
      setBusyAction(null)
      return
    }
    try {
      downloadUtf8TextFile(`تقرير-مصادر-الموضوع-${topicId}.txt`, loaded.report.text)
      setNotice(loaded.warning
        ? {
            kind: 'warning',
            text: `تم إنشاء ملف UTF-8 وبدء تنزيله. ${loaded.warning}`,
          }
        : { kind: 'success', text: 'تم إنشاء ملف UTF-8 وبدء تنزيل قائمة المصادر بصيغة TXT.' })
    } catch {
      setNotice({ kind: 'error', text: 'تعذر إنشاء ملف TXT. لم يُنشأ ملف.' })
    } finally {
      setBusyAction(null)
    }
  }

  const busy = loading || busyAction !== null

  return (
    <div className="space-y-2" dir="rtl" aria-busy={busy}>
      <div className="no-print flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-600">تصدير مصادر الموضوع:</span>
        <button
          type="button"
          onClick={() => void exportCitations('arabic')}
          disabled={busy}
          aria-busy={busyAction === 'arabic'}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 font-sans text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === 'arabic' && copied
              ? 'border-green-700 bg-green-700 text-white'
              : 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100'
          }`}
        >
          {busyAction === 'arabic'
            ? 'جاري التحميل...'
            : mode === 'arabic' && copied
              ? `✓ تم النسخ (${formatCount(count ?? 0)} حديث)`
              : 'نسخ القائمة العربية'}
        </button>
        <button
          type="button"
          onClick={() => void exportCitations('bibtex')}
          disabled={busy}
          aria-busy={busyAction === 'bibtex'}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === 'bibtex' && copied
              ? 'border-purple-700 bg-purple-700 text-white'
              : 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100'
          }`}
        >
          {busyAction === 'bibtex' ? 'جاري التحميل...' : mode === 'bibtex' && copied ? `✓ Copied (${formatCount(count ?? 0)})` : 'نسخ BibTeX'}
        </button>
        <button
          type="button"
          onClick={() => void downloadTopicReport()}
          disabled={busy}
          aria-busy={busyAction === 'download'}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-green-200 bg-green-50 px-3 py-2 font-sans text-xs text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === 'download' ? 'جاري إنشاء الملف...' : 'تنزيل TXT'}
        </button>
        <ReportPrintButton
          report={report}
          disabled={busy}
          onPreparePrint={async () => {
            const loaded = await loadBoundedReport()
            if (!loaded) return null
            setNotice(loaded.warning ? { kind: 'warning', text: loaded.warning } : null)
            return loaded.report
          }}
          onStatus={(message, kind) => {
            setNotice((current) => current?.kind === 'warning' && kind === 'success'
              ? { kind: 'warning', text: `${message} ${current.text}` }
              : { kind, text: message })
          }}
        />
      </div>
      {notice && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`max-w-xl text-xs leading-relaxed ${
            notice.kind === 'error' ? 'text-red-700' : notice.kind === 'success' ? 'text-green-700' : 'text-amber-700'
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  )
}

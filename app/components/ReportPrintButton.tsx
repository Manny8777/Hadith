'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PrintableReport {
  title: string
  subtitle: string
  text: string
}

export interface ReportPrintResult {
  ok: boolean
  message: string
}

interface ReportPrintButtonProps {
  report: PrintableReport | null
  disabled?: boolean
  label?: string
  onPreparePrint?: (currentReport: PrintableReport | null) => Promise<PrintableReport | null>
  onStatus?: (message: string, kind: 'success' | 'error') => void
}

function waitForPrintPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export default function ReportPrintButton({
  report,
  disabled = false,
  label = 'طباعة التقرير',
  onPreparePrint,
  onStatus,
}: ReportPrintButtonProps) {
  const [mounted, setMounted] = useState(false)
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null)
  const [activeReport, setActiveReport] = useState<PrintableReport | null>(report)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    setMounted(true)
    setPrintRoot(document.getElementById('report-print-root'))
  }, [])

  useEffect(() => {
    setActiveReport(report)
  }, [report])

  useEffect(() => {
    return () => {
      document.body.classList.remove('report-print-active')
    }
  }, [])

  async function handlePrint(): Promise<ReportPrintResult> {
    setPrinting(true)
    let selectedReport = report
    try {
      if (onPreparePrint) {
        selectedReport = await onPreparePrint(report)
        if (!selectedReport) {
          return { ok: false, message: 'تعذر تجهيز التقرير للطباعة.' }
        }
      }
      if (!selectedReport?.text.trim()) {
        return { ok: false, message: 'لا يوجد تقرير صالح للطباعة.' }
      }
      if (!printRoot?.isConnected) {
        const result = { ok: false, message: 'تعذر تجهيز منطقة الطباعة. لم تتم طباعة التقرير.' }
        onStatus?.(result.message, 'error')
        return result
      }

      setActiveReport(selectedReport)
      await waitForPrintPaint()
      if (document.fonts) await document.fonts.ready
      if (!selectedReport.text.trim() || !printRoot.isConnected) {
        throw new Error('Print report became unavailable.')
      }

      document.body.classList.add('report-print-active')
      const cleanup = () => {
        document.body.classList.remove('report-print-active')
        setPrinting(false)
      }
      const fallbackCleanup = window.setTimeout(cleanup, 5 * 60_000)
      const afterPrint = () => {
        window.clearTimeout(fallbackCleanup)
        cleanup()
      }
      document.addEventListener('afterprint', afterPrint, { once: true })
      try {
        window.print()
      } catch (error) {
        document.removeEventListener('afterprint', afterPrint)
        window.clearTimeout(fallbackCleanup)
        throw error
      }

      const result = { ok: true, message: 'تم فتح نافذة طباعة التقرير المنسق.' }
      onStatus?.(result.message, 'success')
      return result
    } catch {
      document.body.classList.remove('report-print-active')
      const result = { ok: false, message: 'تعذر فتح نافذة الطباعة. لم تُطبع أي صفحة.' }
      onStatus?.(result.message, 'error')
      return result
    } finally {
      if (!document.body.classList.contains('report-print-active')) setPrinting(false)
    }
  }

  const busy = disabled || printing
  const reportNode = mounted && printRoot && activeReport
    ? createPortal(
        <article className="report-print-document" data-report-print-article dir="rtl" lang="ar">
          <header className="report-print-heading">
            <h1>{activeReport.title}</h1>
            <p>{activeReport.subtitle}</p>
          </header>
          <pre className="report-print-text">{activeReport.text}</pre>
        </article>,
        printRoot,
      )
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrint()}
        disabled={busy}
        aria-busy={busy}
        aria-label={activeReport ? `${label}: ${activeReport.title}` : label}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-sans text-xs text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {printing ? 'جاري تجهيز الطباعة...' : label}
      </button>
      {reportNode}
    </>
  )
}

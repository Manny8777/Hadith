'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PrintButton from './PrintButton'
import SaveHadith from './SaveHadith'
import HadithExport from './HadithExport'
import ChainTimeline from './ChainTimeline'
import IsnadChainTimeline from './IsnadChainTimeline'
// import HadithNote from './HadithNote' // TODO: re-enable with per-user login
import TrackHadithView from './TrackHadithView'
import IsnadTree from './IsnadTree'
import HadithNumber from './HadithNumber'
import MatnVariants from './MatnVariants'
import MatnSimilaritySection from './MatnSimilaritySection'
import PrevNextNav from './PrevNextNav'
import GhareebMatn from './GhareebMatn'
import SanadNarrators from './SanadNarrators'
import HadithServiceSection, { activeServiceSections } from './HadithServiceSection'
import type { HadithServiceKey } from './HadithServiceSection'
import { stripTashkeel } from '@/lib/ghareeb'
import { splitSanadMatn, stripXmlToVerbatim } from '@/lib/hadithText'
import type { SanadNarratorPreview, SanadSegment } from '@/lib/sanadNarrators'
import type { ReactNode } from 'react'

function cleanHadithContent(xml: string): string {
  return stripXmlToVerbatim(xml)
}

// Reader-adjustable matn sizes (responsive clamps so every level scales on mobile).
// Level 0 matches the sanad text size; the default sits one level above it.
const MATN_SIZES = [
  'clamp(0.9375rem, 0.9rem + 0.2vw, 1.05rem)', // 0 — same as السند (~15–16px)
  'clamp(1.1rem, 0.95rem + 0.7vw, 1.35rem)',   // 1 — default (~18–22px)
  'clamp(1.3rem, 1rem + 1.3vw, 1.7rem)',       // 2
  'clamp(1.55rem, 1.05rem + 2vw, 2.05rem)',    // 3
  'clamp(1.8rem, 1.1rem + 2.8vw, 2.4rem)',     // 4
]
const MATN_SIZE_DEFAULT = 1

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="ui-section-head">
      <h2 className="ui-section-head-title">{label}</h2>
      {sub && <span className="ui-section-head-sub">{sub}</span>}
      <div className="ui-section-head-rule" />
    </div>
  )
}

export interface NarratorInChain {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
  tabaqa: string | null
  death_year_num: number | null
  death_year: string | null
  mudallis?: boolean
}

export interface Chain {
  narrators: NarratorInChain[]
  tahdethTerm?: string | null
  narratorTerms?: Record<number, string>
}

export interface Judgment {
  say_text: string
  scientist_id: number | null
  scientist_name: string | null
  abb_name: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  grade_class: string | null
  source_book: string | null
  source_part: number | null
  source_page: number | null
  source_content_id: number | null
}

export interface HadithInfo {
  main_id: number
  book_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  section_text: string | null
  chapter_text: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  tarqeem_matboa2?: number | null
  print1_edition: string | null
  tarf: string | null
  content: string
  prev_paragraph_id: number
  next_paragraph_id: number
}

export type { HadithServiceKey }

export interface HadithSidebarLayoutProps {
  hadithId: number
  hadith: HadithInfo
  chains: Chain[]
  commonNarrators: NarratorInChain[]
  judgments: Judgment[]
  subjects: Array<{ id: number; title: string }>
  relatedHadiths: Array<{ main_id: number; tarf: string | null; book_title: string }>
  takhrijBooks: string[]
  takhrijSummary: { mutabaatCount: number; shawahidCount: number }
  booksTakhrij?: Array<{ id: number; title: string }>
  hadithServices?: Partial<Record<HadithServiceKey, boolean>>
  isnadType?: number | null
  sanadSegments?: SanadSegment[]
  sanadNarrators?: Record<number, SanadNarratorPreview>
  matngroupSlot?: ReactNode
  takhrijSlot: ReactNode
}

const ISNAD_TYPE_MAP: Record<number, { label: string; cls: string; desc: string }> = {
  1: { label: 'مرفوع',  cls: 'bg-green-100 text-green-800 border-green-300',  desc: 'يُنسب إلى النبي ﷺ' },
  2: { label: 'موقوف',  cls: 'bg-amber-100 text-amber-800 border-amber-300',  desc: 'ينتهي عند الصحابي' },
  3: { label: 'مقطوع',  cls: 'bg-orange-100 text-orange-800 border-orange-300', desc: 'ينتهي عند التابعي' },
  4: { label: 'مرسل',   cls: 'bg-blue-100 text-blue-800 border-blue-300',     desc: 'التابعي يروي عن النبي ﷺ مباشرة' },
}

export default function HadithSidebarLayout({
  hadithId, hadith: h, chains, commonNarrators,
  judgments, subjects, takhrijBooks, takhrijSummary,
  booksTakhrij,
  hadithServices, isnadType,
  sanadSegments,
  sanadNarrators = {},
  matngroupSlot,
  takhrijSlot,
}: HadithSidebarLayoutProps) {
  const [showTashkeel, setShowTashkeel] = useState(true)
  const [matnSize, setMatnSize] = useState(MATN_SIZE_DEFAULT)

  // Track the sticky header height so the TOC sidebar + section anchors sit flush under it
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const apply = () => document.documentElement.style.setProperty('--app-header-h', `${Math.round(header.getBoundingClientRect().height)}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  // Persist the reader's matn-size preference across hadiths/sessions
  useEffect(() => {
    const saved = parseInt(localStorage.getItem('matnSize') ?? '', 10)
    if (!Number.isNaN(saved) && saved >= 0 && saved < MATN_SIZES.length) setMatnSize(saved)
  }, [])
  useEffect(() => {
    localStorage.setItem('matnSize', String(matnSize))
  }, [matnSize])

  const serviceSections = activeServiceSections(hadithServices)

  // Sections shown in main content and sidebar TOC — dynamic based on available data
  const SECTIONS = [
    { id: 'isnad',   label: 'الأسانيد والرواة' },
    { id: 'shajar',  label: 'شجرة الإسناد' },
    ...(judgments.length > 0 ? [{ id: 'aqwal', label: 'أقوال العلماء' }] : []),
    { id: 'takhrij', label: 'التخريج' },
    ...serviceSections.map(s => ({ id: s.id, label: s.label })),
    { id: 'variants', label: 'المتن المُجمَّع والاختلافات' },
    { id: 'adawat',  label: 'أدوات البحث' },
  ]

  function applyTashkeel(text: string): string {
    if (showTashkeel) return text
    return stripTashkeel(text)
  }

  // Judgment grade styles
  const gradeOf = (g: string | null) =>
    g === 'صحيح' ? { bar: 'bg-green-500', badge: 'bg-green-100 text-green-800 border-green-200', border: 'border-green-200' } :
    g === 'حسن'  ? { bar: 'bg-blue-400',  badge: 'bg-blue-100 text-blue-800 border-blue-200',   border: 'border-blue-100'  } :
    g === 'ضعيف' ? { bar: 'bg-red-400',   badge: 'bg-red-100 text-red-700 border-red-200',     border: 'border-red-100'   } :
                    { bar: 'bg-gray-300',  badge: 'bg-gray-100 text-gray-600 border-gray-200',  border: 'border-gray-100'  }

  // Group judgments by scientist
  const judgmentGroups: Judgment[][] = []
  const keyIndex = new Map<string, number>()
  for (const j of judgments) {
    const key = j.scientist_id != null ? `id-${j.scientist_id}` : `name-${j.scientist_name ?? 'unknown'}`
    if (keyIndex.has(key)) {
      judgmentGroups[keyIndex.get(key)!].push(j)
    } else {
      keyIndex.set(key, judgmentGroups.length)
      judgmentGroups.push([j])
    }
  }

  const tocLinkClass = "w-full text-right px-3 py-2.5 flex items-center gap-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-green-800 border-l-[3px] border-transparent hover:border-green-300 transition-all"

  return (
    <div className="flex flex-col sm:flex-row -mx-3 sm:-mx-4 gap-0 min-w-0">

      {/* ── RIGHT SIDEBAR (TOC) ── */}
      <aside className="w-52 shrink-0 self-start sticky hidden sm:flex flex-col bg-white border-l border-gray-200 shadow-sm" style={{ top: 'var(--app-header-h, 9rem)', height: 'calc(100dvh - var(--app-header-h, 9rem))' }}>
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 shrink-0">
          <p className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">المحتوى</p>
        </div>

        {/* Section list + quick links scroll together so the list isn't squeezed by a pinned footer */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <nav className="py-1">
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} className={tocLinkClass}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-gray-300" />
                {s.label}
              </a>
            ))}
          </nav>

          <div className="border-t border-gray-100 px-3 py-3 space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">روابط سريعة</p>
            {[
              { href: `/hadith/${hadithId}/witnesses`,       label: 'الشواهد والمتابعات' },
              { href: `/hadith/${hadithId}/pivot`,           label: 'مدار الحديث' },
              { href: `/hadith/${hadithId}/isnad-ranking`,   label: 'ترتيب الأسانيد' },
              { href: `/hadith/${hadithId}/across-books`,    label: 'الحديث في المصادر' },
            ].map(lnk => (
              <a key={lnk.href} href={lnk.href}
                className="block text-xs text-green-700 hover:text-green-900 hover:underline py-0.5">
                {lnk.label} ←
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 min-w-0 px-3 sm:px-4 pt-2 pb-8">
        <TrackHadithView hadithId={hadithId} hadithTitle={h.book_title + (h.tarqeem_harf ? ` رقم ${h.tarqeem_harf}` : '')} />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2 flex-wrap font-sans">
          <Link href={`/books/${h.book_id}`} className="text-green-700 hover:underline font-medium">
            {h.book_title}
          </Link>
          {h.section_text?.trim() && <><span className="text-gray-300">←</span><span>{h.section_text.trim()}</span></>}
          {h.chapter_text?.trim() && <><span className="text-gray-300">←</span><span>{h.chapter_text.trim()}</span></>}
          {(h.part_num > 0 || h.page_num > 0) && (
            <span className="text-gray-300 mr-1">ج{h.part_num} ص{h.page_num}</span>
          )}
          {(h.tarqeem_harf || h.tarqeem_matboa1 || h.tarqeem_matboa2) && (
            <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} matboa2={h.tarqeem_matboa2} />
          )}
        </div>

        {/* Tarf */}
        {h.tarf?.trim() && (
          <p className="text-sm text-gray-500 italic mb-2 text-right font-serif leading-relaxed" dir="rtl">
            {h.tarf.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
          </p>
        )}

        {/* Consensus grade badge + takhrij count */}
        {(() => {
          const gradeCounts: Record<string, number> = {}
          judgments.forEach(j => { if (j.grade_class) gradeCounts[j.grade_class] = (gradeCounts[j.grade_class] ?? 0) + 1 })
          const consensusGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
          const gradeBadgeCls = consensusGrade === 'صحيح' ? 'bg-green-600 text-white border-green-700' :
            consensusGrade === 'حسن'  ? 'bg-blue-500 text-white border-blue-600' :
            consensusGrade === 'ضعيف' ? 'bg-red-500 text-white border-red-600' :
            'bg-gray-200 text-gray-500 border-gray-300'
          const tooltip = Object.entries(gradeCounts).map(([g, n]) => `${g} ×${n}`).join('، ')
          const takhrijCount = takhrijSummary.mutabaatCount + takhrijSummary.shawahidCount
          return (
            <div className="mb-3 flex items-center gap-3 flex-wrap">
              <span
                title={tooltip || undefined}
                className={`inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full border cursor-default ${gradeBadgeCls}`}
              >
                <span className="font-normal opacity-80">الحكم:</span>
                <span className="font-bold">{consensusGrade ?? 'لا يوجد'}</span>
              </span>
              {takhrijCount > 0 && (
                <a href="#takhrij" className="text-xs text-gray-500 hover:text-green-700 hover:underline transition-colors">
                  أُخرجه في {takhrijCount} مصدر
                </a>
              )}
            </div>
          )
        })()}

        {/* Isnad type badge + tahdeth term + غريب الحديث badge */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {isnadType && ISNAD_TYPE_MAP[isnadType] && (() => {
            const t = ISNAD_TYPE_MAP[isnadType]
            return (
              <span
                title={t.desc}
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full border font-semibold text-xs ${t.cls}`}
              >
                {t.label}
              </span>
            )
          })()}
          {(() => {
            const terms = chains.map(c => c.tahdethTerm).filter(Boolean) as string[]
            if (terms.length === 0) return null
            const freq: Record<string, number> = {}
            terms.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 })
            const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border font-serif text-xs bg-teal-50 text-teal-700 border-teal-200">
                {dominant}
              </span>
            )
          })()}
          {hadithServices?.ghareeb && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border font-semibold text-xs bg-amber-100 text-amber-800 border-amber-300">
              غريب الحديث
            </span>
          )}
        </div>

        {/* Companion narrator */}
        {(() => {
          const companion = chains.flatMap(c => c.narrators).find(n => n.is_companion)
          if (!companion) return null
          return (
            <div className="text-xs text-gray-500 mb-2 text-right" dir="rtl">
              رواه{' '}
              <Link href={`/narrator/${companion.id}`} className="text-green-800 hover:underline font-semibold">
                {companion.name}
              </Link>
            </div>
          )
        })()}

        {/* Print reference badge */}
        {h.tarqeem_matboa1 && (
          <div className="text-[11px] text-gray-400 mb-2 text-right" dir="rtl">
            {h.print1_edition && <span className="font-medium text-gray-500">{h.print1_edition}: </span>}
            <span>{h.tarqeem_matboa1}</span>
          </div>
        )}

        {/* Controls bar */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <a href={`/hadith/compare?a=${hadithId}`}
              className="text-xs border border-indigo-200 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
              قارن
            </a>
            <button
              onClick={() => setShowTashkeel(v => !v)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                showTashkeel
                  ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  : 'border-amber-300 bg-amber-50 text-amber-700 font-medium'
              }`}
            >
              {showTashkeel ? 'بلا تشكيل' : 'مع التشكيل'}
            </button>
            {/* Matn font-size stepper */}
            <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden" data-no-convert>
              <button
                onClick={() => setMatnSize(s => Math.max(0, s - 1))}
                disabled={matnSize <= 0}
                title="تصغير حجم المتن"
                aria-label="تصغير حجم المتن"
                className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                أ−
              </button>
              <span className="px-1.5 text-[10px] text-gray-400 border-x border-gray-200 select-none" title="حجم المتن">حجم</span>
              <button
                onClick={() => setMatnSize(s => Math.min(MATN_SIZES.length - 1, s + 1))}
                disabled={matnSize >= MATN_SIZES.length - 1}
                title="تكبير حجم المتن"
                aria-label="تكبير حجم المتن"
                className="px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                أ+
              </button>
            </div>
            <PrintButton />
            <SaveHadith hadithId={hadithId} />
            <HadithExport
              hadith={{
                main_id: hadithId,
                book_title: h.book_title,
                takhrij_author: h.takhrij_author,
                takhrij_death: h.takhrij_death,
                section_text: h.section_text,
                chapter_text: h.chapter_text,
                part_num: h.part_num,
                page_num: h.page_num,
                tarqeem_harf: h.tarqeem_harf,
                tarqeem_matboa1: h.tarqeem_matboa1,
                tarf: h.tarf,
              }}
              chain={chains[0]?.narrators || []}
              takhrijBooks={takhrijBooks}
              takhrijSummary={takhrijSummary}
              judgments={judgments.map(j => ({
                say_text: j.say_text,
                scientist_name: j.scientist_name,
                grade_class: j.grade_class,
              }))}
            />
            {/* TODO: re-enable when per-user login/notes are implemented
            <HadithNote hadithId={hadithId} />
            */}
          </div>
        </div>

        {/* Hadith text — sanad then matn (matn is the hero) */}
        {(() => {
          const { sanad, matn } = splitSanadMatn(h.content)
          const matnText = matn || cleanHadithContent(h.content)
          return (
            <div className="ui-card mb-4 overflow-hidden">
              {sanad && (
                <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-border bg-surface-sunken">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 font-sans">السند</p>
                  {sanadSegments && sanadSegments.length > 0 ? (
                    <SanadNarrators
                      segments={sanadSegments}
                      narrators={sanadNarrators}
                      showTashkeel={showTashkeel}
                      className="hadith-sanad"
                    />
                  ) : (
                    <p className="hadith-sanad" dir="rtl">
                      {applyTashkeel(sanad)}
                    </p>
                  )}
                </div>
              )}
              <div
                className={sanad ? 'px-4 sm:px-6 py-6 sm:py-8' : 'px-4 sm:px-6 py-8 sm:py-10'}
                style={{ ['--matn-size' as string]: MATN_SIZES[matnSize] }}
              >
                {sanad && (
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 font-sans">المتن</p>
                )}
                {hadithServices?.ghareeb ? (
                  <GhareebMatn
                    hadithId={hadithId}
                    matn={matnText}
                    showTashkeel={showTashkeel}
                    className="hadith-matn"
                  />
                ) : (
                  <p className="hadith-matn" dir="rtl">
                    {applyTashkeel(matnText)}
                  </p>
                )}
              </div>
            </div>
          )
        })()}

        {/* Subject tags */}
        {subjects.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">الموضوعات</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map(s => (
                <Link key={s.id} href={`/topics/item/${s.id}`}
                  className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 hover:border-amber-300 transition-colors">
                  {s.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Books takhrij cross-references */}
        {booksTakhrij && booksTakhrij.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">الكتب التي خرّجته</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {booksTakhrij.map(b => (
                <Link key={b.id} href={`/books/${b.id}`}
                  className="text-xs bg-green-50 text-green-800 border border-green-200 px-2.5 py-1 rounded-full hover:bg-green-100 hover:border-green-300 transition-colors">
                  {b.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Mobile: horizontal TOC strip */}
        <div className="sm:hidden mb-5 -mx-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-1.5 pb-1 px-1 min-w-max">
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-green-300 shrink-0 transition-colors">
                {s.label}
              </a>
            ))}
          </div>
        </div>

        {/* ── الأسانيد والرواة ── */}
        <section id="isnad" className="mb-8 scroll-mt-header">
          <SectionHeader label="الأسانيد والرواة" sub={chains.length > 0 ? (() => {
            const dm: Record<number, string> = {3:'ثلاثي',4:'رباعي',5:'خماسي',6:'سداسي',7:'سباعي',8:'ثماني',9:'تساعي',10:'عشاري'}
            const lens = chains.map(c => c.narrators.length)
            const mn = Math.min(...lens), mx = Math.max(...lens)
            const dl = mn === mx ? (dm[mn] || `${mn} رواة`) : `${dm[mn]||mn}–${dm[mx]||mx}`
            return `${dl} · ${chains.length} ${chains.length === 1 ? 'سند' : 'أسانيد'} · ${chains[0].narrators.length} رواة`
          })() : undefined} />
          {chains.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">لا يوجد إسناد مسجل لهذا الحديث</p>
          ) : (
            <div className="space-y-3">
              {/* Primary: rich vertical isnad timeline (death year · grade · tabaqa · tadlis · per-link term) */}
              <IsnadChainTimeline chains={chains} />

              {/* Secondary: chronological (death-year) view of the primary chain */}
              <details className="rounded-xl border border-border bg-surface overflow-hidden group">
                <summary className="cursor-pointer list-none select-none px-4 py-3 flex items-center justify-between gap-2 text-sm font-medium text-gray-600 hover:text-green-800 transition-colors">
                  <span>الجدول الزمني للسند — الفجوات بين الرواة</span>
                  <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 -mt-1">
                  <ChainTimeline narrators={chains[0].narrators} />
                </div>
              </details>

              {commonNarrators.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-800 mb-2">النقطة المشتركة (مدار) جميع الأسانيد</p>
                  <div className="flex flex-wrap gap-2">
                    {commonNarrators.map(n => (
                      <Link key={n.id} href={`/narrator/${n.id}`}
                        className="text-sm px-3 py-1 rounded-lg border border-green-200 bg-surface hover:shadow-sm hover:border-green-300 transition-all">
                        {n.abb_name || n.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── شجرة الإسناد ── */}
        <section id="shajar" className="mb-8 scroll-mt-header">
          <SectionHeader label="شجرة الإسناد" sub="رسم تشجيري لمسارات رواية الحديث عبر جميع كتب التخريج" />
          <IsnadTree hadithId={hadithId} />
        </section>

        {/* ── أقوال العلماء والدرجة ── */}
        {judgmentGroups.length > 0 && (
          <section id="aqwal" className="mb-8 scroll-mt-header">
            <SectionHeader label="أقوال العلماء" sub={`${judgmentGroups.length} عالم · ${judgments.length} قول`} />

            {(() => {
              const gradeCounts: Record<string, number> = {}
              judgments.forEach(j => { if (j.grade_class) gradeCounts[j.grade_class] = (gradeCounts[j.grade_class] ?? 0) + 1 })
              const dominant = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]
              const domGrade = dominant?.[0] ?? null
              const domCls = domGrade === 'صحيح' ? 'bg-green-600 text-white border-green-700' :
                             domGrade === 'حسن'  ? 'bg-blue-500 text-white border-blue-600' :
                             domGrade === 'ضعيف' ? 'bg-red-500 text-white border-red-600' :
                             'bg-gray-200 text-gray-600 border-gray-300'
              const otherCount = judgments.filter(j => !j.grade_class).length
              if (!domGrade && otherCount === judgments.length) return null
              return (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {domGrade && (
                      <span className={`text-sm font-bold px-4 py-1.5 rounded-full border ${domCls}`}>
                        {domGrade}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(gradeCounts).map(([g, n]) => {
                        const cls = g === 'صحيح' ? 'bg-green-100 text-green-800 border-green-200' :
                                    g === 'حسن'  ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    'bg-red-100 text-red-700 border-red-200'
                        return (
                          <span key={g} className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${cls}`}>
                            {g} ×{n}
                          </span>
                        )
                      })}
                      {otherCount > 0 && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200 font-medium">
                          أخرى ×{otherCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            <div className="space-y-3">
              {judgmentGroups.map((group, gi) => {
                const first = group[0]
                const cardStyle = gradeOf(first.grade_class)
                return (
                  <div key={gi} className={`rounded-xl border bg-white overflow-hidden ${cardStyle.border}`}>
                    <div className={`h-1 w-full ${cardStyle.bar}`} />
                    <div className="p-4">
                      {group.map((j, ji) => (
                        <div key={ji}>
                          {ji > 0 && <hr className="my-3 border-gray-100" />}
                          <div className="flex items-start gap-2 mb-1">
                            {j.grade_class && (
                              <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${gradeOf(j.grade_class).badge}`}>
                                {j.grade_class}
                              </span>
                            )}
                            <p className="text-gray-800 text-sm leading-relaxed">{j.say_text}</p>
                          </div>
                          {j.source_book && (
                            <div className="mt-1">
                              {j.source_content_id ? (
                                <Link href={`/service-content/${j.source_content_id}`}
                                  className="text-xs text-blue-600 hover:underline">
                                  {j.source_book}{j.source_part != null && j.source_page != null ? `: (${j.source_part} / ${j.source_page})` : ''}
                                </Link>
                              ) : (
                                <span className="text-xs text-gray-400">
                                  {j.source_book}{j.source_part != null && j.source_page != null ? `: (${j.source_part} / ${j.source_page})` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 flex-wrap pt-3 mt-3 border-t border-gray-50">
                        {first.scientist_name ? (
                          <>
                            {first.scientist_id ? (
                              <Link href={`/narrator/${first.scientist_id}`}
                                className="text-sm font-bold text-green-800 hover:text-green-600 hover:underline">
                                {first.abb_name || first.scientist_name}
                              </Link>
                            ) : (
                              <span className="text-sm font-bold text-green-800">
                                {first.abb_name || first.scientist_name}
                              </span>
                            )}
                            {first.death_year_num && (
                              <span className="text-xs text-gray-400">ت {first.death_year_num}هـ</span>
                            )}
                            {first.martaba_ibn_hajar && (
                              <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                                {first.martaba_ibn_hajar}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">غير محدد العالم</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── التخريج ── */}
        <section id="takhrij" className="mb-8 scroll-mt-header">
          <SectionHeader label="التخريج" sub="مصادر الحديث في كتب السنة — التصنيف من برنامج الجامع" />
          {takhrijSlot}
        </section>

        {/* ── مطابقة المتون (حساب مباشر) ── */}
        <MatnSimilaritySection hadithId={hadithId} />

        {/* ── الخدمات العلمية (inline) ── */}
        {serviceSections.map(cfg => (
          <section key={cfg.id} id={cfg.id} className="mb-8 scroll-mt-header">
            <SectionHeader label={cfg.label} />
            <HadithServiceSection hadithId={hadithId} config={cfg} />
          </section>
        ))}

        {/* ── مقارنة المتون (group matn) ── */}
        {matngroupSlot && (
          <section id="matn-group" className="mb-6 scroll-mt-header">
            {matngroupSlot}
          </section>
        )}

        {/* ── المتن المُجمَّع والاختلافات ── */}
        <section id="variants" className="mb-8 scroll-mt-header">
          <SectionHeader label="المتن المُجمَّع والاختلافات" sub="مقارنة ألفاظ الروايات وتصنيف الاختلافات" />
          <MatnVariants
            hadithId={hadithId}
            currentTarf={h.tarf}
            currentBookTitle={h.book_title}
            currentDeath={h.takhrij_death}
          />
        </section>

        {/* ── أدوات البحث ── */}
        <section id="adawat" className="mb-8 scroll-mt-header">
          <SectionHeader label="أدوات البحث" />
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { href: `/hadith/${hadithId}/transmission-history`, label: 'تاريخ انتشار الحديث',    desc: 'ترتيب زمني للكتب التي أوردت هذا الحديث حسب وفاة مؤلفيها' },
              { href: `/hadith/${hadithId}/chain-analysis`,       label: 'التحليل الزمني للإسناد', desc: 'رسم زمني لرواة السند مع الفجوات الزمنية' },
              { href: `/hadith/${hadithId}/all-narrators`,        label: 'رجال الحديث',            desc: 'قائمة كاملة بكل رواة هذا الحديث من مجموع الأسانيد' },
              { href: `/hadith/${hadithId}/witnesses`,            label: 'الشواهد والمتابعات',     desc: 'روايات موازية من صحابة آخرين — تُستخدم لتقوية الحديث' },
              { href: `/hadith/${hadithId}/across-books`,         label: 'الحديث في كتب الحديث',   desc: 'مقارنة نص الحديث عبر جميع الكتب التي خرّجته' },
              { href: `/hadith/${hadithId}/pivot`,                label: 'مدار الحديث',            desc: 'الراوي الذي تجتمع عنده جميع أسانيد الحديث' },
              { href: `/hadith/${hadithId}/isnad-ranking`,        label: 'ترتيب الأسانيد قوةً',    desc: 'ترتيب جميع أسانيد الحديث من الأقوى إلى الأضعف' },
              { href: `/hadith/${hadithId}/chain-weakness`,       label: 'الحلقات الضعيفة',        desc: 'مواطن الضعف في السند' },
            ].map(item => (
              <a key={item.href} href={item.href}
                className="flex flex-col gap-0.5 ui-card p-3 hover:border-green-300 transition-all">
                <span className="text-sm font-medium text-green-900">{item.label}</span>
                <span className="text-xs text-gray-400">{item.desc}</span>
              </a>
            ))}
          </div>
        </section>

        <PrevNextNav
          prevId={h.prev_paragraph_id || null}
          nextId={h.next_paragraph_id || null}
        />

      </div>
    </div>
  )
}

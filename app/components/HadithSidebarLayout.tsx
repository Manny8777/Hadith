'use client'

import { useState } from 'react'
import Link from 'next/link'
import ParallelTexts from './ParallelTexts'
import PrintButton from './PrintButton'
import SaveHadith from './SaveHadith'
import HadithExport from './HadithExport'
import ChainTimeline from './ChainTimeline'
import ChainAnalysis from './ChainAnalysis'
import JudgmentTimeline from './JudgmentTimeline'
import HadithNote from './HadithNote'
import TrackHadithView from './TrackHadithView'
import HadithNeighbors from './HadithNeighbors'
import IsnadTree from './IsnadTree'
import type { ReactNode } from 'react'

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
}

// Strip all tags and decode entities — for excerpt/card use
function stripTags(html: string): string {
  return decodeEntities(
    (html || '').replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

// Full hadith body: remove Arabic XML structural elements that carry
// reference numbers (رقم_حديث, رقم_الفقرة, نه) which are not display text,
// strip remaining tags, decode entities, drop the leading " - " separator.
function cleanHadithContent(xml: string): string {
  return decodeEntities(
    (xml || '')
      // Remove hadith-number elements and their text content (closed by an HTML comment)
      .replace(/<رقم_حديث[^>]*>[\s\S]*?<!--رقم_حديث-->/g, '')
      // Remove self-closing structural refs
      .replace(/<رقم_الفقرة[^/]*\/>/g, '')
      .replace(/<نه\/>/g, '')
      // Strip all remaining tags
      .replace(/<[^>]+>/g, ' ')
  )
    // Strip the leading dash separator left after number removal
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function chainDepthLabel(count: number): string {
  const labels: Record<number, string> = {
    3: 'ثلاثي', 4: 'رباعي', 5: 'خماسي', 6: 'سداسي',
    7: 'سباعي', 8: 'ثماني', 9: 'تساعي', 10: 'عشاري',
  }
  return labels[count] || ''
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
}

export interface Chain {
  narrators: NarratorInChain[]
}

export interface Judgment {
  say_text: string
  scientist_name: string | null
  abb_name: string | null
  grade_class: string | null
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
  tarf: string | null
  content: string
  prev_paragraph_id: number
  next_paragraph_id: number
}

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
  // Pre-rendered server component slots
  servicesBadgesSlot: ReactNode
  takhrijSlot: ReactNode
}

type TabId = 'isnad' | 'takhrij' | 'matn' | 'aqwal' | 'tahlil' | 'jadwal' | 'shajar' | 'mawduat' | 'adawat'

const TABS: { id: TabId; label: string }[] = [
  { id: 'isnad',   label: 'الأسانيد' },
  { id: 'takhrij', label: 'التخريج' },
  { id: 'matn',    label: 'مقارنة المتون' },
  { id: 'aqwal',   label: 'أقوال العلماء' },
  { id: 'tahlil',  label: 'تحليل الحديث' },
  { id: 'jadwal',  label: 'الجدول الزمني' },
  { id: 'shajar',  label: 'شجرة الإسناد' },
  { id: 'mawduat', label: 'الموضوعات' },
  { id: 'adawat',  label: 'أدوات البحث' },
]

export default function HadithSidebarLayout({
  hadithId, hadith: h, chains, commonNarrators,
  judgments, subjects, relatedHadiths, takhrijBooks, takhrijSummary,
  servicesBadgesSlot, takhrijSlot,
}: HadithSidebarLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>('isnad')

  return (
    <div className="flex -mx-4 gap-0">

      {/* ── RIGHT SIDEBAR (first child = right in RTL) ── */}
      <aside className="w-52 shrink-0 self-start sticky top-12 hidden sm:flex flex-col bg-white border-l border-gray-200 shadow-sm" style={{ minHeight: 'calc(100vh - 48px)' }}>

        {/* Panel header */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">الخدمات</p>
        </div>

        {/* Tab list */}
        <nav className="flex-1 py-1 overflow-y-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-right px-3 py-2.5 flex items-center gap-2.5 transition-all text-sm ${
                activeTab === tab.id
                  ? 'bg-green-50 text-green-900 border-l-[3px] border-green-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-green-800 border-l-[3px] border-transparent'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                activeTab === tab.id ? 'bg-green-600' : 'bg-gray-300'
              }`} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Quick links at bottom */}
        <div className="border-t border-gray-100 px-3 py-3 space-y-1.5">
          <p className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">روابط سريعة</p>
          {[
            { href: `/hadith/${hadithId}/research-report`, label: 'التقرير البحثي' },
            { href: `/hadith/${hadithId}/witnesses`,       label: 'الشواهد والمتابعات' },
            { href: `/hadith/${hadithId}/pivot`,           label: 'مدار الحديث' },
            { href: `/hadith/${hadithId}/isnad-ranking`,   label: 'ترتيب الأسانيد' },
          ].map(lnk => (
            <a key={lnk.href} href={lnk.href}
              className="block text-xs text-green-700 hover:text-green-900 hover:underline py-0.5">
              {lnk.label} ←
            </a>
          ))}
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA (second child = left in RTL) ── */}
      <div className="flex-1 min-w-0 px-4 pt-2 pb-8">
        <TrackHadithView hadithId={hadithId} hadithTitle={h.book_title + (h.tarqeem_harf ? ` رقم ${h.tarqeem_harf}` : '')} />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2 flex-wrap">
          <Link href={`/books/${h.book_id}`} className="text-green-700 hover:underline font-medium">
            {h.book_title}
          </Link>
          {h.section_text?.trim() && <><span className="text-gray-300">←</span><span>{h.section_text.trim()}</span></>}
          {h.chapter_text?.trim() && <><span className="text-gray-300">←</span><span>{h.chapter_text.trim()}</span></>}
          {(h.part_num > 0 || h.page_num > 0) && (
            <span className="text-gray-300 mr-1">
              ج{h.part_num} ص{h.page_num}
              {h.tarqeem_harf?.trim() && ` — رقم ${h.tarqeem_harf.trim()}`}
            </span>
          )}
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          {servicesBadgesSlot}
          <div className="flex items-center gap-1.5 flex-wrap">
            <a href={`/hadith/compare?a=${hadithId}`}
              className="text-xs border border-indigo-200 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
              قارن
            </a>
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
          </div>
        </div>

        {/* Researcher note */}
        <HadithNote hadithId={hadithId} />

        {/* Hadith text */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4 text-lg leading-loose">
          {cleanHadithContent(h.content)}
        </div>

        {/* Subject tags */}
        {subjects.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {subjects.map(s => (
              <Link key={s.id} href={`/topics/item/${s.id}`}
                className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 hover:border-amber-300 transition-colors">
                {s.title}
              </Link>
            ))}
          </div>
        )}

        {/* Mobile: horizontal tab strip */}
        <div className="sm:hidden mb-4 overflow-x-auto">
          <div className="flex gap-1.5 pb-1 min-w-max">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`text-xs px-3 py-1.5 rounded-full border shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-green-700 text-white border-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-green-300'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="mb-6">

          {activeTab === 'isnad' && (
            <div className="space-y-3">
              {chains.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">لا يوجد إسناد مسجل لهذا الحديث</p>
              ) : (
                <>
                  {chains.map((chain, ci) => (
                    <div key={ci} className="rounded-xl border border-gray-100 bg-white p-5">
                      <h2 className="font-bold text-green-900 text-sm mb-3 flex items-center gap-2">
                        {chains.length > 1
                          ? `السند ${ci === 0 ? 'الأول' : ci === 1 ? 'الثاني' : ci === 2 ? 'الثالث' : ci + 1}`
                          : 'السند'}
                        {chainDepthLabel(chain.narrators.length) && (
                          <span className="text-xs font-normal text-gray-400">
                            {chainDepthLabel(chain.narrators.length)} — {chain.narrators.length} رواة
                          </span>
                        )}
                      </h2>
                      <div className="flex flex-wrap gap-2 items-center">
                        {chain.narrators.map((nar, i) => (
                          <span key={i} className="flex items-center gap-1.5">
                            <Link href={`/narrator/${nar.id}`}
                              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-gray-50 hover:border-green-300 hover:bg-green-50 hover:text-green-900 transition-all">
                              {nar.abb_name || nar.name}
                            </Link>
                            {i < chain.narrators.length - 1 && (
                              <span className="text-gray-300 text-lg">←</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <ChainTimeline narrators={chain.narrators} />
                    </div>
                  ))}
                  {commonNarrators.length > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <p className="text-xs font-semibold text-blue-700 mb-2">النقطة المشتركة في جميع الأسانيد</p>
                      <div className="flex flex-wrap gap-2">
                        {commonNarrators.map(n => (
                          <Link key={n.id} href={`/narrator/${n.id}`}
                            className="text-sm px-3 py-1 rounded-lg border border-blue-200 bg-white hover:shadow-sm transition-all">
                            {n.abb_name || n.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'takhrij' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">مصادر الحديث في كتب السنة — التخريج الكامل</p>
              {takhrijSlot}
            </div>
          )}

          {activeTab === 'matn' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">نصوص الروايات الموازية لهذا الحديث في سائر المصادر — مفيدة لدراسة الألفاظ والمتابعات</p>
              <ParallelTexts hadithId={hadithId} />
            </div>
          )}

          {activeTab === 'aqwal' && (
            <div>
              {judgments.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">لا توجد أحكام علمية مسجلة لهذا الحديث</p>
              ) : (
                <div className="grid gap-2.5">
                  {judgments.map((j, i) => (
                    <div key={i} className="rounded-lg p-4 border border-gray-100 bg-white">
                      <p className="text-gray-800 text-sm leading-relaxed">{j.say_text}</p>
                      {j.scientist_name && (
                        <p className="font-bold text-green-700 text-xs mt-2">
                          — {j.abb_name || j.scientist_name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tahlil' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">فحص رواة الإسناد — مفيد لتقييم صحة الحديث من حيث رجاله</p>
              <ChainAnalysis hadithId={hadithId} />
            </div>
          )}

          {activeTab === 'jadwal' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">أقوال المحدثين مرتبةً بحسب وفياتهم — يكشف تطور موقف العلماء من الحديث عبر الزمن</p>
              <JudgmentTimeline hadithId={hadithId} />
            </div>
          )}

          {activeTab === 'shajar' && (
            <div>
              <p className="text-xs text-gray-400 mb-3">رسم تشجيري لمسارات رواية هذا الحديث من النبي ﷺ عبر جميع كتب التخريج</p>
              <IsnadTree hadithId={hadithId} />
            </div>
          )}

          {activeTab === 'mawduat' && (
            <div>
              {relatedHadiths.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">لا توجد أحاديث ذات صلة موضوعية</p>
              ) : (
                <div className="space-y-2">
                  {relatedHadiths.map(r => (
                    <Link key={r.main_id} href={`/hadith/${r.main_id}`}
                      className="flex items-start gap-3 text-sm group bg-white p-3 rounded-lg border border-gray-100 hover:border-green-100 hover:shadow-sm transition-all">
                      <span className="shrink-0 text-xs text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded mt-0.5">
                        {r.book_title}
                      </span>
                      <span className="text-gray-700 group-hover:text-green-700 leading-6 line-clamp-1">
                        {stripTags(r.tarf || '').slice(0, 120) || `حديث ${r.main_id}`}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'adawat' && (
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { href: `/hadith/${hadithId}/transmission-history`, label: 'تاريخ انتشار الحديث',    desc: 'ترتيب زمني للكتب التي أوردت هذا الحديث حسب وفاة مؤلفيها' },
                { href: `/hadith/${hadithId}/chain-analysis`,       label: 'التحليل الزمني للإسناد', desc: 'رسم زمني لرواة السند مع الفجوات الزمنية' },
                { href: `/hadith/${hadithId}/all-narrators`,        label: 'رجال الحديث',            desc: 'قائمة كاملة بكل رواة هذا الحديث من مجموع الأسانيد' },
                { href: `/hadith/${hadithId}/witnesses`,            label: 'الشواهد والمتابعات',     desc: 'روايات موازية من صحابة آخرين — تُستخدم لتقوية الحديث' },
                { href: `/hadith/${hadithId}/across-books`,         label: 'الحديث في كتب الحديث',   desc: 'مقارنة نص الحديث عبر جميع الكتب التي خرّجته' },
                { href: `/hadith/${hadithId}/pivot`,                label: 'مدار الحديث',            desc: 'الراوي الذي تجتمع عنده جميع أسانيد الحديث' },
                { href: `/hadith/${hadithId}/isnad-ranking`,        label: 'ترتيب الأسانيد قوةً',    desc: 'ترتيب جميع أسانيد الحديث من الأقوى إلى الأضعف' },
                { href: `/hadith/${hadithId}/matn-variants`,        label: 'فروق المتن',             desc: 'اختلافات الألفاظ بين الروايات المختلفة' },
                { href: `/hadith/${hadithId}/chain-weakness`,       label: 'الحلقات الضعيفة',        desc: 'مواطن الضعف في السند' },
                { href: `/hadith/${hadithId}/research-report`,      label: 'التقرير البحثي الشامل',  desc: 'تقرير أكاديمي متكامل يجمع النص والأسانيد والأحكام' },
              ].map(item => (
                <a key={item.href} href={item.href}
                  className="flex flex-col gap-0.5 bg-white border border-gray-100 rounded-lg p-3 hover:border-green-200 hover:shadow-sm transition-all">
                  <span className="text-sm font-medium text-green-900">{item.label}</span>
                  <span className="text-xs text-gray-400">{item.desc}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Neighboring hadiths in same chapter */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <h2 className="font-bold text-gray-700 text-sm mb-2">الأحاديث المجاورة في الباب</h2>
          <HadithNeighbors hadithId={hadithId} />
        </div>

        {/* Previous / Next */}
        <div className="flex justify-between mt-4 text-sm">
          {h.prev_paragraph_id > 0 && (
            <Link href={`/hadith/${h.prev_paragraph_id}`} className="text-green-700 hover:underline">
              → السابق
            </Link>
          )}
          {h.next_paragraph_id > 0 && (
            <Link href={`/hadith/${h.next_paragraph_id}`} className="text-green-700 hover:underline">
              ← التالي
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

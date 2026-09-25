'use client'
import { useState, useRef, useEffect } from 'react'
import { useNumbering } from '@/lib/numberingContext'
import { useNumeral } from '@/lib/numeralContext'
import { useTheme } from '@/lib/themeContext'
import UiIcon from './UiIcon'
import BrandMark from './BrandMark'

type NavLink = { href: string; label: string; isNew?: boolean }
type NavCategory = { id: string; label: string; links: NavLink[] }

const CATEGORIES: NavCategory[] = [
  {
    id: 'view',
    label: 'عرض',
    links: [
      { href: '/books', label: 'كتب المتون' },
      // { href: '/musnad-musannaf', label: 'المسند المصنف المعلل', isNew: true },
      { href: '/books/service-books', label: 'الكتب الخدمية' },
      { href: '/hadiths/tarf-index', label: 'قائمة الأطراف' },
      { href: '/hadiths/tarfs-by-isnad', label: 'أطراف على الأسانيد' },
      { href: '/books/intersection', label: 'متفق وزوائد المصنفات' },
      { href: '/hadiths/narrator-additions', label: 'زوائد الرواة عن المصنفين' },
      { href: '/matn-compare', label: 'المتون المجمعة' },
      { href: '/lexicon', label: 'تعريفات' },
      { href: '/saved', label: 'مجالات المستخدم' },
      // { href: '/hadiths/chapters', label: 'فهرس الأبواب', isNew: true },
      // { href: '/chapters', label: 'بحث الأبواب', isNew: true },
      // { href: '/find-by-number', label: 'رقم الحديث', isNew: true },
      // { href: '/hadith/compare', label: 'مقارنة حديثين', isNew: true },
      // { href: '/books/author-profile', label: 'ملف الكتاب', isNew: true },
      // { href: '/books/chapter-analysis', label: 'تحليل الأبواب', isNew: true },
    ],
  },
  {
    id: 'narrators',
    label: 'رواة',
    links: [
      { href: '/narrators', label: 'قائمة الرواة' },
      { href: '/companions', label: 'الصحابة' },
      { href: '/narrators/multi-book', label: 'رواة كتاب/كتب' },
      { href: '/narrators/generations', label: 'تصنيفات خاصة بالرواة' },
      { href: '/narrators/jarh-terms', label: 'ألفاظ الجرح والتعديل' },
      { href: '/scholars', label: 'أقوال أهل العلم في أحوال الرواة' },
      // { href: '/bio-search', label: 'التراجم', isNew: true },
      // { href: '/narrators/sahihayn', label: 'رجال الصحيحين', isNew: true },
      // { href: '/narrators/alpha-index', label: 'الفهرس الأبجدي', isNew: true },
      // { href: '/narrators/kunia-index', label: 'فهرس الكنى', isNew: true },
      // { href: '/narrators/city-century', label: 'المدن والقرون', isNew: true },
      // { href: '/narrators/chronology', label: 'تسلسل الرواية', isNew: true },
      // { href: '/narrators/prolific-by-century', label: 'أبرز رواة القرن', isNew: true },
      // { href: '/narrators/death-decade', label: 'عقود الوفيات', isNew: true },
      // { href: '/narrators/coverage', label: 'تغطية التراجم', isNew: true },
      // { href: '/narrators/family-transmission', label: 'الرواية العائلية', isNew: true },
      // { href: '/narrators/tabiin-analysis', label: 'تحليل التابعين', isNew: true },
      // { href: '/narrators/tabiin-ranking', label: 'ترتيب التابعين', isNew: true },
      // { href: '/narrators/companion-last', label: 'آخر الصحابة وفاةً', isNew: true },
      // { href: '/narrators/most-cited', label: 'الأكثر انتشاراً', isNew: true },
      // { href: '/narrators/same-name', label: 'تمييز الأسماء', isNew: true },
      // { href: '/narrators/universal', label: 'الرواة الشاملون', isNew: true },
      // { href: '/narrators/hadith-schools', label: 'مدارس الحديث', isNew: true },
      // { href: '/narrators/hub-analysis', label: 'مراكز الشبكة', isNew: true },
      // { href: '/narrators/prolific-students', label: 'أكثر الرواة شيوخاً', isNew: true },
      // { href: '/narrators/sahabi-students', label: 'تلاميذ الصحابة', isNew: true },
      // { href: '/compare', label: 'مقارنة الرواة', isNew: true },
      // { href: '/companions/compare', label: 'مقارنة الصحابة', isNew: true },
      // { href: '/companions/musnad', label: 'المسانيد', isNew: true },
      // { href: '/companions/top-hadiths', label: 'أشهر أحاديث الصحابة', isNew: true },
      // { href: '/companions/isolated-chains', label: 'محدودو الطرق', isNew: true },
      // { href: '/companions/specialties', label: 'تخصصات الصحابة', isNew: true },
      // { href: '/companions/inter-transmission', label: 'رواية الصحابة بعضهم', isNew: true },
      // { href: '/scholars/disagreements', label: 'خلاف المحدثين', isNew: true },
      // { href: '/scholars/compare', label: 'مقارنة المحدثين', isNew: true },
      // { href: '/scholars/activity', label: 'نشاط المحدثين', isNew: true },
      // { href: '/scholars/judgment-phrases', label: 'معجم الأحكام', isNew: true },
      // { href: '/scholars/judgment-search', label: 'بحث الأحكام', isNew: true },
      // { href: '/scholars/isnad-criteria', label: 'معايير الإسناد', isNew: true },
      // { href: '/scholars/early-vs-late', label: 'منهج العلماء بالقرون', isNew: true },
      // { href: '/narrators/contested', label: 'المختلف فيهم', isNew: true },
      // { href: '/narrators/severely-criticized', label: 'المطعون فيهم', isNew: true },
      // { href: '/narrators/unrated', label: 'غير المقيمين', isNew: true },
      // { href: '/narrators/mudallis-catalog', label: 'المدلسون', isNew: true },
      // { href: '/narrators/grade-distribution', label: 'توزيع الدرجات', isNew: true },
    ],
  },
  {
    id: 'topics',
    label: 'مكانز موضوعية',
    links: [
      { href: '/topics', label: 'شجرة الربط الموضوعي' },
      { href: '/topics/contradictions', label: 'ربط بالمخالف' },
      // { href: '/topics/companions', label: 'الصحابة والموضوعات', isNew: true },
      // { href: '/topics/stats', label: 'احصاء الموضوعات', isNew: true },
    ],
  },
  {
    id: 'lexicons',
    label: 'معاجم',
    links: [
      { href: '/lexicon', label: 'معجم غريب الحديث' },
      { href: '/lexicon/places', label: 'معجم الأماكن والبلدان' },
      // { href: '/quran', label: 'القرآن الكريم', isNew: true },
      // { href: '/sections', label: 'تصنيف الكتب', isNew: true },
    ],
  },
  {
    id: 'hadith-sciences',
    label: 'تطبيقات علوم الحديث',
    links: [
      { href: '/hadith-terms', label: 'تطبيقات المصطلح' },
      { href: '/controversial', label: 'مشكل الحديث' },
      { href: '/hadiths/timeline', label: 'تواريخ المتون' },
      { href: '/hadiths/amthal', label: 'أمثال الحديث النبوي' },
      { href: '/scholars/hadith-grades', label: 'أقوال أهل العلم في الحكم على الحديث' },
      { href: '/scholars/hadith-sciences', label: 'أقوال أهل العلم في علوم الحديث' },
      // { href: '/chains', label: 'علو الاسناد', isNew: true },
      // { href: '/narrator-types', label: 'علل الاسناد', isNew: true },
      // { href: '/hadiths/ilal', label: 'علل الحديث', isNew: true },
      // { href: '/narrators/network', label: 'شبكة الأسانيد', isNew: true },
      // { href: '/narrators/chain-filter', label: 'تتبع الاسناد', isNew: true },
      // { href: '/narrators/chain-positions', label: 'مواضع الاسناد', isNew: true },
      // { href: '/hadiths/chain-gaps', label: 'كاشف الانقطاع', isNew: true },
      // { href: '/hadiths/chain-richness', label: 'تعدد الأسانيد', isNew: true },
      // { href: '/hadiths/chain-lengths', label: 'طول الأسانيد', isNew: true },
      // { href: '/hadiths/chain-diversity', label: 'تنوع الأسانيد', isNew: true },
      // { href: '/hadiths/chain-quality', label: 'جودة الأسانيد', isNew: true },
      // { href: '/hadiths/golden-chains', label: 'الأسانيد الذهبية', isNew: true },
      // { href: '/hadiths/narrator-bottleneck', label: 'الراوي الوحيد', isNew: true },
      // { href: '/narrators/short-chains', label: 'الأسانيد العالية', isNew: true },
      // { href: '/narrators/generation-bridge', label: 'رواة الجسور', isNew: true },
      // { href: '/narrators/hearing-gaps', label: 'فجوات السماع', isNew: true },
      // { href: '/narrators/transmission-pairs', label: 'أزواج الرواية', isNew: true },
      // { href: '/narrators/transmission-path', label: 'مسار النقل', isNew: true },
      // { href: '/narrators/city-network', label: 'شبكة المدن', isNew: true },
      // { href: '/narrators/teacher-student-pairs', label: 'ثنائيات الرواية', isNew: true },
      // { href: '/books/chain-age', label: 'عمر الأسانيد', isNew: true },
      // { href: '/books/isnad-diversity', label: 'تنوع المصادر', isNew: true },
      // { href: '/books/authenticity', label: 'جودة الاسناد بالكتاب', isNew: true },
      // { href: '/unique-hadiths', label: 'الأفراد والغرائب', isNew: true },
      // { href: '/hadiths/most-attested', label: 'الأوسع انتشاراً', isNew: true },
      // { href: '/hadiths/cross-topics', label: 'متعدد المواضيع', isNew: true },
      // { href: '/hadiths/unjudged', label: 'غير المحكوم عليه', isNew: true },
      // { href: '/hadiths/weak-supported', label: 'الضعيف المعتضد', isNew: true },
      // { href: '/hadiths/grade-dispute', label: 'الخلاف في الدرجة', isNew: true },
      // { href: '/hadiths/shaykhayn-standard', label: 'على شرط الشيخين', isNew: true },
      // { href: '/hadiths/divergent-judgments', label: 'اختلاف العلماء', isNew: true },
      // { href: '/hadiths/strongest', label: 'أقوى الأحاديث', isNew: true },
      // { href: '/hadiths/in-all-six', label: 'الجامعة للستة', isNew: true },
      // { href: '/hadiths/mawquf', label: 'الموقوف والمرسل', isNew: true },
      // { href: '/hadiths/companion-count', label: 'المتواتر والغريب', isNew: true },
      // { href: '/hadiths/companion-overlap', label: 'تشارك الصحابة', isNew: true },
      // { href: '/hadiths/single-companion', label: 'آحاد الصحابي', isNew: true },
      // { href: '/hadiths/abrogation', label: 'الناسخ والمنسوخ', isNew: true },
      // { href: '/hadiths/qudsi', label: 'الأحاديث القدسية', isNew: true },
      // { href: '/hadiths/prophetic-commands', label: 'الأوامر النبوية', isNew: true },
      // { href: '/hadiths/dua', label: 'الأدعية والأذكار', isNew: true },
      // { href: '/hadiths/fiqh-map', label: 'خريطة الفقه', isNew: true },
      // { href: '/hadiths/matn-keywords', label: 'المتن الموضوعي', isNew: true },
      // { href: '/hadiths/conditional-hadiths', label: 'أحكام الأساليب', isNew: true },
      // { href: '/hadiths/text-length', label: 'أطوال الأحاديث', isNew: true },
      // { href: '/hadiths/grade-evolution', label: 'تطور الأحكام', isNew: true },
      // { href: '/hadiths/weakness-catalog', label: 'فهرس الضعف', isNew: true },
      // { href: '/hadiths/opening-variants', label: 'الروايات المتشابهة', isNew: true },
      // { href: '/hadiths/takhrij-spread', label: 'انتشار التخريج', isNew: true },
      // { href: '/hadiths/grade-by-book', label: 'درجات الكتب', isNew: true },
      // { href: '/hadiths/book-companion-matrix', label: 'مصفوفة الكتب والصحابة', isNew: true },
      // { href: '/hadiths/unique-to-book', label: 'انفرادات الكتب', isNew: true },
    ],
  },
  {
    id: 'indexes',
    label: 'فهارس',
    links: [
      { href: '/indexes/quran', label: 'فهرس الآيات' },
      { href: '/indexes/names', label: 'فهرس الأعلام' },
      { href: '/indexes/poetry', label: 'فهرس الشعر' },
    ],
  },
  {
    id: 'search',
    label: 'بحث',
    links: [
      { href: '/search', label: 'بحث نصي' },
      { href: '/asaneed/builder', label: 'البحث بواسطة السند', isNew: true },
      { href: '/hadiths/advanced-research', label: 'بحث متعدد' },
    ],
  },
  {
    id: 'services',
    label: 'خدمات',
    links: [
      { href: '/narrators/stats', label: 'احصائيات الرواة' },
      { href: '/hadiths/tarf-stats', label: 'إحصائيات الأطراف' },
      { href: '/stats', label: 'احصائيات الأحاديث' },
      { href: '/takhrij', label: 'تخريج الأبحاث العلمية' },
      // { href: '/books/uniqueness', label: 'تفرد الكتب', isNew: true },
      // { href: '/books/exclusive-hadiths', label: 'منفردات الكتب', isNew: true },
      // { href: '/books/timeline', label: 'تاريخية التدوين', isNew: true },
      // { href: '/books/transmission-genealogy', label: 'تداخل الكتب', isNew: true },
    ],
  },
]

function NumberingToggle() {
  const { pref, toggle } = useNumbering()
  return (
    <button
      onClick={toggle}
      title={pref === 'harf' ? 'التبديل الى ترقيم المطبوع' : 'التبديل الى ترقيم حرف'}
      className="flex items-center gap-1 text-[11px] text-[#F8F1E4]/80 hover:text-[#FFFDF7] border border-[#C9A96B]/35 hover:border-[#C9A96B] px-2 py-1 rounded transition-colors shrink-0 whitespace-nowrap"
    >
      <span className={pref === 'harf' ? 'text-[#E6C77A] font-bold' : 'text-[#F8F1E4]/55'}>حرف</span>
      <UiIcon name="arrow" size={14} className="text-[#C9A96B]/70" />
      <span className={pref === 'matboa' ? 'text-[#E6C77A] font-bold' : 'text-[#F8F1E4]/55'}>مطبوع</span>
    </button>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      data-no-convert
      title={dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
      aria-label="تبديل المظهر"
      className="flex items-center justify-center w-8 h-8 rounded-md text-[#F8F1E4]/80 hover:text-[#FFFDF7] border border-[#C9A96B]/35 hover:border-[#C9A96B] transition-colors shrink-0"
    >
      <UiIcon name={dark ? 'sun' : 'moon'} size={16} />
    </button>
  )
}

function NumeralToggle() {
  const { pref, toggle } = useNumeral()
  return (
    <button
      onClick={toggle}
      data-no-convert
      title="تبديل صيغة الأرقام بين الإنجليزية (123) والعربية (١٢٣) — يشمل الموقع كله"
      className="flex items-center justify-center gap-1 text-[11px] text-[#F8F1E4]/80 hover:text-[#FFFDF7] border border-[#C9A96B]/35 hover:border-[#C9A96B] px-2 py-1 rounded transition-colors shrink-0 whitespace-nowrap"
    >
      <span className={pref === 'western' ? 'text-[#E6C77A] font-bold' : 'text-[#F8F1E4]/55'}>123</span>
      <UiIcon name="arrow" size={14} className="text-[#C9A96B]/70" />
      <span className={pref === 'arabic' ? 'text-[#E6C77A] font-bold' : 'text-[#F8F1E4]/55'}>١٢٣</span>
    </button>
  )
}

export default function NavHeader() {
  const [open, setOpen] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(id: string) {
    setOpen(prev => (prev === id ? null : id))
  }

  return (
    <nav ref={navRef} className="theme-texture relative z-30 bg-[#0F3D2E] text-[#F8F1E4] font-sans border-b border-[#C9A96B]/40" dir="rtl">
      <div className="max-w-7xl mx-auto flex items-center gap-1.5 px-3 sm:px-6 lg:px-7 py-1.5 sm:py-2 min-w-0">
        <a href="/" className="group flex items-center gap-2.5 px-1 py-1 ml-1 sm:ml-3 shrink-0 text-[#F8F1E4] transition-colors hover:text-[#E6C77A]">
          <BrandMark size={36} className="shrink-0" />
          <span className="flex flex-col leading-none font-display">
            <span className="text-[10px] tracking-wide text-[#C9A96B]">موسوعة الحديث</span>
            <span className="mt-0.5 whitespace-nowrap text-sm sm:text-base font-bold">جامع خادم الحرمين</span>
          </span>
        </a>

        <div className="hidden sm:block w-px h-5 bg-[#C9A96B]/35 mx-1 shrink-0" />

        {/* Desktop: inline categories with dropdowns */}
        <div className="hidden sm:flex items-center gap-0.5 flex-1 min-w-0 flex-wrap">
          {CATEGORIES.map(cat => (
            <div key={cat.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => toggle(cat.id)}
                className={`flex items-center gap-1 text-sm font-sans px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  open === cat.id
                    ? 'bg-[#C9A96B] text-[#0F3D2E]'
                    : 'text-[#F8F1E4]/80 hover:text-[#FFFDF7] hover:bg-white/10'
                }`}
              >
                {cat.label}
                <UiIcon name="chevron" size={13} className={`text-[10px] opacity-60 ${open === cat.id ? 'rotate-90' : '-rotate-90'}`} />
              </button>

              {open === cat.id && (
                <div
                  className="absolute top-full right-0 mt-1.5 bg-[#FFFDF7] text-[#17201D] rounded-xl shadow-[0_8px_30px_rgba(23,32,29,.12)] border border-[#C9A96B]/40 p-3 z-[100] overflow-y-auto font-sans w-[min(100vw-1.5rem,640px)] max-h-[80vh]"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-0.5">
                    {cat.links.map(link => (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(null)}
                        className="flex items-center justify-between gap-1 text-sm text-[#17201D] hover:text-[#0F3D2E] hover:bg-[#F0E8D8] px-2 py-1 rounded transition-colors"
                      >
                        <span className="truncate">{link.label}</span>
                        {link.isNew && (
                          <span className="shrink-0 text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1 py-0.5 rounded-sm font-bold leading-none">
                            جديد
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile: push toggles + menu button to the end */}
        <div className="flex-1 sm:hidden" />

        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle />
          <div className="flex flex-col items-stretch gap-1">
            <NumberingToggle />
            <NumeralToggle />
          </div>
        </div>

        {/* Mobile: hamburger toggles the category menu */}
        <button
          type="button"
          onClick={() => { setMobileOpen(v => !v); setOpen(null) }}
          aria-label="القائمة"
          aria-expanded={mobileOpen}
          className="sm:hidden flex items-center justify-center w-9 h-9 rounded-md text-[#F8F1E4] border border-[#C9A96B]/40 hover:border-[#C9A96B] hover:bg-white/10 transition-colors shrink-0"
        >
          <UiIcon name={mobileOpen ? 'close' : 'menu'} size={18} />
        </button>
      </div>

      {/* Mobile: collapsible category menu (accordion — avoids clipping dropdowns) */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-[#C9A96B]/30 bg-[#F8F1E4] text-[#17201D] max-h-[72vh] overflow-y-auto overscroll-contain">
          {CATEGORIES.map(cat => (
            <div key={cat.id} className="border-b border-border/60">
              <button
                type="button"
                onClick={() => toggle(cat.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                  open === cat.id ? 'text-[#0F3D2E] font-semibold bg-[#E2EEE7]' : 'text-[#17201D]/85'
                }`}
              >
                {cat.label}
                <UiIcon name="chevron" size={13} className={`text-[10px] opacity-60 ${open === cat.id ? 'rotate-90' : '-rotate-90'}`} />
              </button>
              {open === cat.id && (
                <div className="px-3 pb-2.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {cat.links.map(link => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => { setOpen(null); setMobileOpen(false) }}
                      className="flex items-center justify-between gap-1 text-[13px] text-gray-700 hover:text-green-800 active:bg-green-50 px-2 py-1 rounded transition-colors"
                    >
                      <span className="truncate">{link.label}</span>
                      {link.isNew && (
                        <span className="shrink-0 text-[8px] bg-amber-100 text-amber-700 border border-amber-200 px-1 rounded-sm font-bold leading-none">جديد</span>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </nav>
  )
}

import Link from 'next/link'
import Image from 'next/image'
import pool from '@/lib/db'
import HomeSearch from '@/app/components/HomeSearch'
import BrandMark from '@/app/components/BrandMark'
import UiIcon, { type IconName } from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

const GRADE_SHORTCUTS = [
  { label: 'ثقة', href: '/narrators?grade=ثقة', color: 'bg-green-100 text-green-800 border-green-200' },
  { label: 'صدوق', href: '/narrators?grade=صدوق', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { label: 'ضعيف', href: '/narrators?grade=ضعيف', color: 'bg-red-100 text-red-800 border-red-200' },
  { label: 'مجهول', href: '/narrators?grade=مجهول', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { label: 'الصحابة', href: '/narrators?companion=1', color: 'bg-amber-500 text-white border-amber-500' },
]

export default async function Home() {
  let hadiths = 339607, narrators = 30087, books = 245, topics = 25922, lexicon = 13399, bio = 0, criticism = 0
  try {
    const [h, n, bio_cnt, crit_cnt] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM hadith_toc').catch(() => ({ rows: [{ count: hadiths }] })),
      pool.query('SELECT COUNT(*) FROM narrators').catch(() => ({ rows: [{ count: narrators }] })),
      pool.query('SELECT COUNT(DISTINCT narrator_id) FROM narrator_biography').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(DISTINCT narrator_id) FROM narrator_criticism').catch(() => ({ rows: [{ count: 0 }] })),
    ])
    hadiths = parseInt(h.rows[0].count as string)
    narrators = parseInt(n.rows[0].count as string)
    bio = parseInt(bio_cnt.rows[0].count as string)
    criticism = parseInt(crit_cnt.rows[0].count as string)
  } catch {}

  return (
    <div dir="rtl" className="home-page">
      {/* Hero */}
      <div className="home-hero theme-texture">
        <div className="home-hero-atmosphere" aria-hidden="true">
          <Image src="/assets/brand/library-atmosphere.png" alt="" fill sizes="(max-width: 767px) 100vw, 600px" className="object-cover" />
        </div>
        <div className="home-hero-content">
          <div className="home-hero-heading">
            <div className="home-brand-plaque"><BrandMark size={108} full /></div>
            <div>
              <p className="home-eyebrow">برنامج خادم الحرمين الشريفين</p>
              <h1 className="home-title font-display">
                موسوعة الحديث النبوي الشريف
              </h1>
              <p className="home-description font-sans">
                قاعدة بيانات متكاملة لباحثي الحديث في مراحل الماجستير والدكتوراه
              </p>
            </div>
          </div>

          <HomeSearch />

          {/* Quick examples */}
          <div className="home-search-examples font-sans">
            <span>جرب:</span>
            {['إنما الأعمال بالنيات', 'من كذب علي', 'الطهور شطر الإيمان'].map(ex => (
              <Link key={ex} href={`/search?q=${encodeURIComponent(ex)}`}
                className="text-[#E6D2AA] hover:text-[#FFFDF7] hover:underline">
                {ex}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="home-ornament" aria-hidden="true">
        <img src="/assets/theme-ornament.svg" alt="" width="240" height="24" />
      </div>

      {/* Stats banner */}
      <div className="home-stats">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
          {[
            { num: hadiths.toLocaleString('ar-EG'), label: 'حديث' },
            { num: narrators.toLocaleString('ar-EG'), label: 'راوٍ' },
            { num: books.toString(), label: 'كتاب' },
            { num: topics.toLocaleString('ar-EG'), label: 'موضوع' },
            { num: bio.toLocaleString('ar-EG'), label: 'راوٍ مترجَم' },
            { num: criticism.toLocaleString('ar-EG'), label: 'راوٍ مجروح/معدَّل' },
          ].map((s, i) => (
            <div key={i} className="home-stat ui-card">
              <UiIcon name={(['book-open', 'narrator', 'books', 'topics', 'bio', 'scale'] as IconName[])[i]} size={24} className="mx-auto mb-2 text-accent-gold" />
              <div className="text-2xl font-bold text-ink font-display">{s.num}</div>
              <div className="text-xs text-muted mt-0.5 font-sans">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Nav Cards */}
      <div className="home-sections max-w-6xl mx-auto px-4 py-8 sm:py-10">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
          {[
            { href: '/books', icon: 'books' as IconName, title: 'تصفح الكتب', description: `${books} كتاباً من أمهات المصادر` },
            { href: '/narrators', icon: 'narrator' as IconName, title: 'علم الرجال', description: `${narrators.toLocaleString('ar-EG')} راوٍ مع ترجمة وجرح وتعديل` },
            { href: '/search', icon: 'search' as IconName, title: 'البحث المتقدم', description: 'بحث نصي مع تصفية بالكتاب' },
            { href: '/topics', icon: 'topics' as IconName, title: 'الفهارس الموضوعية', description: `${topics.toLocaleString('ar-EG')} موضوع مصنَّف` },
            { href: '/lexicon', icon: 'lexicon' as IconName, title: 'غريب الحديث', description: `${lexicon.toLocaleString('ar-EG')} لفظة معتمدة` },
            { href: '/narrators?sort=hadiths', icon: 'chart' as IconName, title: 'أكثر الرواة حديثاً', description: 'مرتب حسب عدد الأحاديث' },
          ].map((card) => (
            <Link key={card.href} href={card.href} className="home-nav-card ui-card group p-5">
              <div className="ui-icon-tile mb-4 h-11 w-11">
                <UiIcon name={card.icon} size={24} />
              </div>
              <div className="font-bold text-primary font-display">{card.title}</div>
              <div className="text-sm text-muted mt-1 font-sans">{card.description}</div>
            </Link>
          ))}
        </div>

        {/* الكتب الستة quick links */}
        <div className="home-book-section ui-card rounded-2xl p-5 sm:p-6 mb-4">
          <h2 className="text-base font-bold text-green-900 mb-4 font-display">الكتب الستة والمسانيد الكبرى</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 1, name: 'صحيح البخاري', count: '٧٤١٠' },
              { id: 2, name: 'صحيح مسلم', count: '٧٦٦٦' },
              { id: 5, name: 'سنن النسائي', count: '٥٧٨٠' },
              { id: 3, name: 'سنن أبي داود', count: '٥٢٦٠' },
              { id: 4, name: 'جامع الترمذي', count: '٤٤١٢' },
              { id: 6, name: 'سنن ابن ماجه', count: '٤٤٦٧' },
              { id: 7, name: 'موطأ مالك', count: '١٧٨١' },
              { id: 8, name: 'مسند أحمد', count: '٢٨٢٤٥' },
            ].map(book => (
              <Link key={book.id} href={`/books/${book.id}`}
                className="home-book-chip">
                <UiIcon name="book-open" size={20} className="text-accent-gold mb-1" />
                <span className="font-semibold text-sm leading-snug">{book.name}</span>
                <span className="text-xs text-gray-400 mt-1">{book.count} حديث</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Narrator Grade Shortcuts */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-base font-bold text-green-900 mb-4">تصفح الرواة حسب الدرجة</h2>
          <div className="flex flex-wrap gap-3">
            {GRADE_SHORTCUTS.map(g => (
              <Link key={g.label} href={g.href}
                className={`px-5 py-2.5 rounded-full border font-medium text-sm transition-all hover:shadow-sm ${g.color}`}>
                {g.label}
              </Link>
            ))}
            <Link href="/narrators?sort=death"
              className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 font-medium text-sm hover:border-[#C9A96B] hover:shadow-sm transition-all">
              ترتيب بالوفاة
            </Link>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">بحث سريع في الرواة:</p>
            <div className="flex flex-wrap gap-2">
              {['البخاري', 'مسلم', 'أنس بن مالك', 'أبو هريرة', 'ابن عمر', 'عائشة'].map(name => (
                <Link key={name} href={`/narrators?q=${encodeURIComponent(name)}`}
                  className="text-xs bg-green-50 text-green-800 border border-green-100 px-3 py-1 rounded-full hover:bg-green-100 transition-colors">
                  {name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Research Tools */}
        <div className="home-research-tools ui-card p-5 sm:p-6 mt-4">
          <h2 className="text-base font-bold text-green-900 mb-4">أدوات بحثية متخصصة</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Link href="/chains" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">علو الإسناد</div>
              <div className="text-xs text-gray-500 mt-1">ثلاثيات ورباعيات وخماسيات الكتب</div>
            </Link>
            <Link href="/narrator-types" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">علل الإسناد</div>
              <div className="text-xs text-gray-500 mt-1">المدلسون والمختلطون وأهل الإرسال</div>
            </Link>
            <Link href="/bio-search" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">بحث في التراجم</div>
              <div className="text-xs text-gray-500 mt-1">تهذيب الكمال والكاشف وغيرها</div>
            </Link>
            <Link href="/narrators/cities" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">رواة البلدان</div>
              <div className="text-xs text-gray-500 mt-1">تصفح الرواة حسب المدينة والبلد</div>
            </Link>
            <Link href="/compare" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">مقارنة الرواة</div>
              <div className="text-xs text-gray-500 mt-1">مقارنة الطبقة والشيوخ والتلاميذ</div>
            </Link>
            <Link href="/narrators/network" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">محورية الرواة</div>
              <div className="text-xs text-gray-500 mt-1">أكثر الرواة حضوراً في شبكة الأسانيد</div>
            </Link>
            <Link href="/narrators/chain-filter" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">تتبع الإسناد</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث جمعت رواة محددين في سند واحد</div>
            </Link>
            <Link href="/narrators/stats" className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-gray-900 text-sm group-hover:text-gray-700">إحصاءات الرواة</div>
              <div className="text-xs text-gray-500 mt-1">توزيع الطبقات والوفيات والتوثيق</div>
            </Link>
            <Link href="/books/stats" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">إحصاءات الكتب</div>
              <div className="text-xs text-gray-500 mt-1">توزيع درجات الأحاديث في كل مصدر</div>
            </Link>
            <Link href="/scholars" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">أحكام المحدثين</div>
              <div className="text-xs text-gray-500 mt-1">تصحيح وتحسين وتضعيف الأحاديث حسب كل عالم</div>
            </Link>
            <Link href="/saved" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">★ المجموعة البحثية</div>
              <div className="text-xs text-gray-500 mt-1">احفظ أحاديث بحثك وصدّرها كمصادر أكاديمية</div>
            </Link>
            <Link href="/companions" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">الصحابة الرواة</div>
              <div className="text-xs text-gray-500 mt-1">كبار الصحابة مرتبين بعدد أحاديثهم مع روابطهم</div>
            </Link>
            <Link href="/find-by-number" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">البحث برقم الحديث</div>
              <div className="text-xs text-gray-500 mt-1">انتقل لحديث بعينه من رقمه في أي كتاب</div>
            </Link>
            <Link href="/books/intersection" className="bg-cyan-50 border border-cyan-100 rounded-xl px-4 py-3 hover:border-cyan-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-cyan-900 text-sm group-hover:text-cyan-700">تقاطع الكتب</div>
              <div className="text-xs text-gray-500 mt-1">المشترك بين كتابَين والمنفردات عبر التخريج</div>
            </Link>
            <Link href="/scholars/disagreements" className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 hover:border-rose-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-rose-900 text-sm group-hover:text-rose-700">خلاف المحدثين</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث اختُلف فيها بين التصحيح والتضعيف</div>
            </Link>
            <Link href="/narrators/generations" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-emerald-900 text-sm group-hover:text-emerald-700">طبقات الرواة</div>
              <div className="text-xs text-gray-500 mt-1">تصفح الرواة مرتبين بطبقاتهم التاريخية</div>
            </Link>
            <Link href="/topics/stats" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">إحصاء الموضوعات</div>
              <div className="text-xs text-gray-500 mt-1">توزيع درجات الأحاديث على الموضوعات الكبرى</div>
            </Link>
            <Link href="/scholars/parallel-routes" className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 hover:border-sky-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-sky-900 text-sm group-hover:text-sky-700">الشواهد والمتابعات</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث ضعيفة لها طرق موازية في المصادر</div>
            </Link>
            <Link href="/matn-compare" className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 hover:border-violet-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-violet-900 text-sm group-hover:text-violet-700">مقارنة المتون</div>
              <div className="text-xs text-gray-500 mt-1">مقارنة نصوص الروايات المتوازية كلمةً بكلمة</div>
            </Link>
            <Link href="/books/timeline" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">تاريخية التدوين</div>
              <div className="text-xs text-gray-500 mt-1">نشأة كتب الحديث وتطورها عبر القرون الهجرية</div>
            </Link>
            <Link href="/chapters" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">بحث في الأبواب</div>
              <div className="text-xs text-gray-500 mt-1">ابحث عن عنوان باب عبر جميع كتب الحديث</div>
            </Link>
            <Link href="/unique-hadiths" className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 hover:border-yellow-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-yellow-900 text-sm group-hover:text-yellow-700">الأحاديث الفردة</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث لا نظير لها في سائر المصادر — الغرائب والأفراد</div>
            </Link>
            <Link href="/books/compare" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">مقارنة الكتب</div>
              <div className="text-xs text-gray-500 mt-1">مقارنة منهجية بين كتابَين — الدرجات والأسانيد والصحابة</div>
            </Link>
            <Link href="/hadiths/most-attested" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">الأوسع انتشاراً</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث مروية في أكبر عدد من كتب الحديث — الأكثر تواتراً نسبياً</div>
            </Link>
            <Link href="/hadiths/tarf-index" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">فهرس الأطراف</div>
              <div className="text-xs text-gray-500 mt-1">تصفح أوائل ألفاظ الأحاديث أبجدياً كتحفة الأشراف</div>
            </Link>
            <Link href="/narrators/sahihayn" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">رجال الصحيحين</div>
              <div className="text-xs text-gray-500 mt-1">الرواة الذين احتج بهم البخاري ومسلم في صحيحيهما</div>
            </Link>
            <Link href="/topics/companions" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">الصحابة × الموضوعات</div>
              <div className="text-xs text-gray-500 mt-1">خريطة حرارية: أي الصحابة روى أكثر في كل موضوع</div>
            </Link>
            <Link href="/narrators/jarh-terms" className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 hover:border-rose-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-rose-900 text-sm group-hover:text-rose-700">مصطلحات الجرح والتعديل</div>
              <div className="text-xs text-gray-500 mt-1">توزيع درجات الرواة وفق ألفاظ الجرح والتعديل من قاعدة البيانات</div>
            </Link>
            <Link href="/scholars/compare" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">مقارنة المحدثين</div>
              <div className="text-xs text-gray-500 mt-1">مقارنة أحكام محدثَين على نفس الأحاديث — توافقاً وخلافاً</div>
            </Link>
            <Link href="/narrators/chain-positions" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">الرواة في مواضع الإسناد</div>
              <div className="text-xs text-gray-500 mt-1">أكثر الرواة ظهوراً في كل موقع من مواضع الإسناد — يكشف "مدار" الحديث</div>
            </Link>
            <Link href="/hadiths/cross-topics" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">الأحاديث متعددة المواضيع</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث صُنِّفت في أكثر من موضوع — الأحاديث الجامعة ذات الأثر التشريعي الشامل</div>
            </Link>
            <Link href="/hadiths/chain-gaps" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">كاشف الانقطاع في الأسانيد</div>
              <div className="text-xs text-gray-500 mt-1">أسانيد بفجوات زمنية كبيرة بين الشيخ والراوي — مؤشر على الانقطاع المحتمل</div>
            </Link>
            <Link href="/narrators/alpha-index" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">الفهرس الأبجدي للرواة</div>
              <div className="text-xs text-gray-500 mt-1">تصفح رواة الحديث أبجدياً من أ إلى ي — كفهارس الكتب الكلاسيكية</div>
            </Link>
            <Link href="/narrators/kunia-index" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">فهرس الكنى</div>
              <div className="text-xs text-gray-500 mt-1">تمييز الرواة بكناهم — أداة للباحث عند ورود الكنية مفردةً في الإسناد</div>
            </Link>
            <Link href="/narrators/multi-book" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">رواة الكتب المتعددة</div>
              <div className="text-xs text-gray-500 mt-1">الرواة الذين أسند عنهم أصحاب أكثر من كتاب — يعكس مدى قبولهم عند المحدثين</div>
            </Link>
            <Link href="/companions/top-hadiths" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">أشهر أحاديث الصحابة</div>
              <div className="text-xs text-gray-500 mt-1">الحديث الأوسع انتشاراً لكل صحابي — يعكس مساهمته التشريعية في المنظومة الحديثية</div>
            </Link>
            <Link href="/hadith/compare" className="bg-cyan-50 border border-cyan-100 rounded-xl px-4 py-3 hover:border-cyan-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-cyan-900 text-sm group-hover:text-cyan-700">مقارنة حديثين</div>
              <div className="text-xs text-gray-500 mt-1">مقارنة حديثين جنباً إلى جنب — المتن والإسناد والأحكام — لتحديد أوجه التوافق والاختلاف</div>
            </Link>
            <Link href="/hadiths/chain-richness" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">الأحاديث متعددة الأسانيد</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث تروى بأكثر الأسانيد المستقلة — مؤشر التواتر المعنوي وقوة الضبط عند المحدثين</div>
            </Link>
            <Link href="/narrators/contested" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">المختلف فيهم من الرواة</div>
              <div className="text-xs text-gray-500 mt-1">رواة جمع فيهم العلماء بين الجرح والتعديل — بيان درجة الخلاف وتوزيع الآراء</div>
            </Link>
            <Link href="/scholars/activity" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">نشاط علماء الجرح والتعديل</div>
              <div className="text-xs text-gray-500 mt-1">ترتيب المحدثين بعدد آرائهم — يكشف أشد النقاد نشاطاً ومنهجهم بين الجرح والتعديل</div>
            </Link>
            <Link href="/hadiths/unjudged" className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-gray-800 text-sm group-hover:text-gray-700">الأحاديث غير المحكوم عليها</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث لم يُسجَّل لها حكم من العلماء — فرصة للبحث والتحقيق في الصحة والضعف</div>
            </Link>
            <Link href="/companions/isolated-chains" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">الصحابة محدودو الطرق</div>
              <div className="text-xs text-gray-500 mt-1">صحابة لم ينقل عنهم سوى راوٍ أو راويَين — يكشف الأسانيد التي تعتمد على راوٍ بعينه اعتماداً كاملاً</div>
            </Link>
            <Link href="/narrators/same-name" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">تمييز الأسماء المتشابهة</div>
              <div className="text-xs text-gray-500 mt-1">رواة يتشابهون في الاسم — أداة لتحديد أيّهم المقصود في الإسناد عبر الطبقة والكنية والشيوخ</div>
            </Link>
            <Link href="/books/uniqueness" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">تفرد الكتب — مؤشر الأصالة</div>
              <div className="text-xs text-gray-500 mt-1">نسبة الأحاديث الفريدة في كل كتاب مقارنةً بالمشتركة — يكشف مدى استقلالية كل مصدر حديثي</div>
            </Link>
            <Link href="/hadiths/chain-lengths" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">توزيع طول الأسانيد</div>
              <div className="text-xs text-gray-500 mt-1">إحصاء الأسانيد بعدد حلقاتها — يكشف عن مستوى علو أو نزول الأسانيد ومتوسط طولها في كل كتاب</div>
            </Link>
            <Link href="/narrators/unrated" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">الرواة غير المُقيَّمين</div>
              <div className="text-xs text-gray-500 mt-1">رواة لم يُقيَّموا في الجرح والتعديل — مجهولو الحال يحتاجون دراسة وتحقيقاً</div>
            </Link>
            <Link href="/hadiths/weak-supported" className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 hover:border-rose-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-rose-900 text-sm group-hover:text-rose-700">الضعيف المعتضد بالشواهد</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث ضعيفة لها شواهد موازية — مرشَّحة للترقي إلى "حسن لغيره" بتضافر الطرق</div>
            </Link>
            <Link href="/hadiths/timeline" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">التسلسل الزمني للتدوين</div>
              <div className="text-xs text-gray-500 mt-1">توزيع الأحاديث بحسب قرن تدوينها — يكشف أي القرون دوَّنت الجزء الأكبر من الموروث الحديثي</div>
            </Link>
            <Link href="/books/authenticity" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-emerald-900 text-sm group-hover:text-emerald-700">جودة أسانيد الكتب</div>
              <div className="text-xs text-gray-500 mt-1">نسبة الأسانيد ذات الثقات فقط في كل كتاب — مقياس كمي لجودة الإسناد العام</div>
            </Link>
            <Link href="/hadiths/ilal" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">فهرس علل الحديث</div>
              <div className="text-xs text-gray-500 mt-1">أنواع العلل (انقطاع، إرسال، تدليس، اضطراب) مع نماذج من الأحاديث المُعلَّلة</div>
            </Link>
            <Link href="/scholars/judgment-search" className="bg-cyan-50 border border-cyan-100 rounded-xl px-4 py-3 hover:border-cyan-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-cyan-900 text-sm group-hover:text-cyan-700">البحث في نصوص الأحكام</div>
              <div className="text-xs text-gray-500 mt-1">ابحث عن مصطلح في جميع أحكام العلماء: "إسناده صحيح"، "على شرط مسلم"، "منقطع"...</div>
            </Link>
            <Link href="/hadiths/grade-dispute" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">الأحاديث المختلف في درجتها</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث صحَّحها بعض العلماء وضعَّفها آخرون — بوابة دراسة الخلاف المنهجي بين النقاد</div>
            </Link>
            <Link href="/narrators/hearing-gaps" className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 hover:border-yellow-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-yellow-900 text-sm group-hover:text-yellow-700">كشاف فجوات السماع</div>
              <div className="text-xs text-gray-500 mt-1">رواة يروون عن الصحابة بفارق زمني كبير — أداة لكشف حالات الانقطاع المحتمل في الأسانيد</div>
            </Link>
            <Link href="/narrators/transmission-pairs" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">أزواج الرواية الأكثر تكراراً</div>
              <div className="text-xs text-gray-500 mt-1">أكثر ثنائيات الشيخ والتلميذ ظهوراً في الأسانيد — خريطة العلاقات العلمية في الرواية الحديثية</div>
            </Link>
            <Link href="/narrators/severely-criticized" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">المطعون فيهم بالجرح الشديد</div>
              <div className="text-xs text-gray-500 mt-1">الوضاعون والكذابون والمتروكون وأصحاب المناكير — فهرس مصنَّف بأشد مراتب الجرح في علم الرجال</div>
            </Link>
            <Link href="/hadiths/shaykhayn-standard" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">على شرط الشيخين</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث حكم العلماء بأن رجالها يستوفون شرط البخاري أو مسلم أو كليهما — مصطلح نقدي دقيق الدلالة</div>
            </Link>
            <Link href="/hadiths/golden-chains" className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 hover:border-yellow-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-yellow-900 text-sm group-hover:text-yellow-700">الأسانيد الذهبية</div>
              <div className="text-xs text-gray-500 mt-1">أسانيد كل رواتها موثَّقون — تكشف عن أقوى الأسانيد وأصحها بالتحليل التلقائي لدرجات الرواة</div>
            </Link>
            <Link href="/hadith-terms" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">مصطلح الحديث — الموسوعة الإحصائية</div>
              <div className="text-xs text-gray-500 mt-1">مصطلحات علوم الحديث مع أعداد حقيقية من قاعدة البيانات — صحيح لذاته، حسن لغيره، مرسل، موضوع...</div>
            </Link>
            <Link href="/controversial" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">مشكل الحديث</div>
              <div className="text-xs text-gray-500 mt-1">مسائل مشكل الحديث ومختلفه مصنَّفةً في شجرة موضوعية — العقيدة والعبادات والمعاملات والأخلاق مع مصادر علمية</div>
            </Link>
            <Link href="/hadiths/amthal" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">أمثال الحديث النبوي</div>
              <div className="text-xs text-gray-500 mt-1">الأمثال الواردة في السنة النبوية — جمل حِكمية وتصويرية استعملها النبي ﷺ لتقريب المعاني وإيضاح الحكم الشرعية</div>
            </Link>
            <Link href="/hadiths/qudsi" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">الأحاديث القدسية</div>
              <div className="text-xs text-gray-500 mt-1">الأحاديث التي فيها "قال الله" أو "يقول ربكم" — مستخرجة بالبحث النصي مع تصنيف الصحابة الرواة لها</div>
            </Link>
            <Link href="/narrators/tabiin-analysis" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">تحليل طبقة التابعين</div>
              <div className="text-xs text-gray-500 mt-1">التابعون مرتَّبون بعدد الصحابة الذين رووا عنهم مباشرةً — يكشف أوسع الجيل الثاني وصلاً بالصحابة</div>
            </Link>
            <Link href="/hadiths/in-all-six" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-emerald-900 text-sm group-hover:text-emerald-700">الأحاديث الجامعة للكتب الستة</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث رواها أصحاب الكتب الستة جميعاً — النواة الأصلب في منظومة الحديث النبوي وأعلاها تواتراً</div>
            </Link>
            <Link href="/narrators/city-century" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">الرواة بالمدن والقرون</div>
              <div className="text-xs text-gray-500 mt-1">خريطة حرارية لتوزيع المحدثين على مدن الإسلام عبر القرون — تكشف تنقُّل مركز الثقل في التحديث</div>
            </Link>
            <Link href="/narrators/universal" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">الرواة الشاملون</div>
              <div className="text-xs text-gray-500 mt-1">رواة وردت أسانيدهم في أكبر عدد من الكتب — يكشف من قبلهم المحدثون جميعاً وعدُّوهم أئمة الرواية</div>
            </Link>
            <Link href="/hadiths/dua" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">أحاديث الأدعية والأذكار</div>
              <div className="text-xs text-gray-500 mt-1">فهرس موضوعي للأدعية النبوية مصنَّفةً بأنواعها — اللهم، رب، تسبيح، استغفار، أذكار الصباح...</div>
            </Link>
            <Link href="/stats" className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-gray-900 text-sm group-hover:text-gray-700">الإحصاءات الشاملة</div>
              <div className="text-xs text-gray-500 mt-1">لوحة بيانات إجمالية لكل محتوى الموسوعة — الأحاديث والرواة والأسانيد والأحكام والكتب والموضوعات</div>
            </Link>
            <Link href="/takhrij" className="bg-green-900 border border-green-800 dark:bg-green-100 dark:border-green-200 rounded-xl px-4 py-3 hover:bg-green-800 dark:hover:bg-green-200 hover:shadow-md transition-all group">
              <div className="font-semibold text-amber-300 dark:text-amber-700 text-sm group-hover:text-amber-200">محرك التخريج</div>
              <div className="text-xs text-green-200 dark:text-green-900/80 mt-1">أدخل نص حديث لاستخراج جميع رواياته الموازية مجموعةً بالتخريج — أساس البحث الأكاديمي في توثيق الحديث</div>
            </Link>
            <Link href="/companions/compare" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">مقارنة الصحابة</div>
              <div className="text-xs text-gray-500 mt-1">قارن بين صحابيَّين في عدد الأحاديث والأسانيد والتلاميذ والكتب — أداة لدراسة الحجم الروائي النسبي</div>
            </Link>
            <Link href="/hadiths/chapters" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">فهرس الأبواب</div>
              <div className="text-xs text-gray-500 mt-1">تصفح أبواب كتب الحديث وعدد الأحاديث — بحث بالموضوع الفقهي عبر جميع الكتب</div>
            </Link>
            <Link href="/hadiths/companion-count" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-emerald-900 text-sm group-hover:text-emerald-700">المتواتر والغريب</div>
              <div className="text-xs text-gray-500 mt-1">تصنيف الأحاديث بعدد الصحابة الرواة — متواتر (10+) ومشهور (3-9) وعزيز (2) وغريب (1)</div>
            </Link>
            <Link href="/hadiths/mawquf" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">الموقوف والمقطوع والمرسل</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث حُكم عليها بالوقف أو القطع أو الإرسال أو الانقطاع — أداة لتمييز الأثر عن المرفوع في البحث الفقهي</div>
            </Link>
            <Link href="/hadiths/strongest" className="bg-green-900 border border-green-700 dark:bg-green-100 dark:border-green-200 rounded-xl px-4 py-3 hover:bg-green-800 dark:hover:bg-green-200 hover:shadow-md transition-all group">
              <div className="font-semibold text-amber-300 dark:text-amber-700 text-sm group-hover:text-amber-200">أقوى الأحاديث توثيقاً</div>
              <div className="text-xs text-green-200 dark:text-green-900/80 mt-1">ترتيب مركَّب: الأسانيد الذهبية + تعدد التصحيح + تعدد الكتب — تحديد أعلى الأحاديث درجةً بمعايير موضوعية متعددة</div>
            </Link>
            <Link href="/hadiths/fiqh-map" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">خريطة الفقه</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث مصنَّفة بالموضوع الفقهي — الطهارة والصلاة والزكاة والحج والبيوع والحدود مع روابط مباشرة للأبواب</div>
            </Link>
            <Link href="/narrators/chronology" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">تسلسل الرواية عبر القرون</div>
              <div className="text-xs text-gray-500 mt-1">خط زمني للرواة عقداً بعقد — يُظهر أوج كل طبقة ومراكز الثقل في الرواية من الصحابة إلى عصر التدوين</div>
            </Link>
            <Link href="/companions/musnad" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">مسانيد الصحابة</div>
              <div className="text-xs text-gray-500 mt-1">حديث كل صحابي منظَّماً بالأبواب على نمط مسند الإمام أحمد — مدخل موضوعي لاستعراض روايات كل صحابي</div>
            </Link>
            <Link href="/narrators/coverage" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">تغطية تراجم الرواة</div>
              <div className="text-xs text-gray-500 mt-1">نسبة الرواة الموثَّقين في كل كتاب — يكشف الثغرات البيوغرافية ويحدد الرواة المجهولين الذين يحتاجون دراسة</div>
            </Link>
            <Link href="/narrators/transmission-path" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">مسار نقل الحديث</div>
              <div className="text-xs text-gray-500 mt-1">تتبع مسار الرواية بين راويَين — هل ثبت أن الأول حدَّث الثاني؟ وكم سنداً؟ وعن طريق من؟</div>
            </Link>
            <Link href="/companions/inter-transmission" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">رواية الصحابة بعضهم عن بعض</div>
              <div className="text-xs text-gray-500 mt-1">أسانيد فيها صحابي يروي عن صحابي — يكشف حركة العلم داخل الجيل الأول وأي الصحابة تلقَّى عن أكثر صحابيٍّ</div>
            </Link>
            <Link href="/hadiths/advanced-research" className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 hover:border-green-400 hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">البحث البحثي المتقدم</div>
              <div className="text-xs text-gray-500 mt-1">جمع المعايير في بحث واحد: النص + الراوي + الباب + الكتاب + الدرجة + عدد الأسانيد — أدق أدوات استرجاع الحديث</div>
            </Link>
            <Link href="/narrators/prolific-by-century" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">أبرز رواة كل قرن</div>
              <div className="text-xs text-gray-500 mt-1">ترتيب الرواة داخل كل قرن هجري بعدد الأحاديث — يكشف أعمدة الرواية وأئمتها في كل عصر من عصور الإسلام</div>
            </Link>
            <Link href="/books/transmission-genealogy" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">تداخل الكتب وتشعب الأسانيد</div>
              <div className="text-xs text-gray-500 mt-1">الأحاديث المشتركة بين المصنَّفات — خريطة تداخل مصادر الحديث وروابطها عبر التخريج المقارن</div>
            </Link>
            <Link href="/scholars/hadith-grades" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">أحكام العلماء على الأحاديث</div>
              <div className="text-xs text-gray-500 mt-1">اختر عالماً لترى ما صحَّحه وضعَّفه — ابن حجر، الألباني، الذهبي — مع توزيع إحصائي لأحكامه</div>
            </Link>
            <Link href="/narrators/hub-analysis" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">مراكز شبكة الرواية</div>
              <div className="text-xs text-gray-500 mt-1">الرواة الأكثر مركزيةً في شبكة الأسانيد — من يجمع أكثر الأحاديث والكتب والصحابة والتلاميذ في مسيرته</div>
            </Link>
            <Link href="/narrators/hadith-schools" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-emerald-900 text-sm group-hover:text-emerald-700">مدارس الحديث الجغرافية</div>
              <div className="text-xs text-gray-500 mt-1">مدارس الرواية بالمدن: المدينة والكوفة والبصرة والشام ومصر وخراسان — توزيع الرواة والأحاديث بالمراكز الكبرى</div>
            </Link>
            <Link href="/hadiths/weakness-catalog" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">فهرس أنواع الضعف</div>
              <div className="text-xs text-gray-500 mt-1">تصنيف الأحاديث بعلَّتها: انقطاع، إرسال، ضعف راوٍ، اضطراب، تدليس، شذوذ — للدراسة المنهجية في علل الحديث</div>
            </Link>
            <Link href="/companions/specialties" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">تخصصات الصحابة في الرواية</div>
              <div className="text-xs text-gray-500 mt-1">أبرز الموضوعات الفقهية في روايات كل صحابي — من تخصَّص في الصلاة أو الزكاة أو النكاح أو غيرها</div>
            </Link>
            <Link href="/books/exclusive-hadiths" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">منفردات الكتب</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث لا توجد إلا في كتاب واحد — مادة فريدة تُظهر ما ينفرد به كل مصنَّف دون سائر كتب الحديث</div>
            </Link>
            <Link href="/hadiths/grade-evolution" className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 hover:border-violet-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-violet-900 text-sm group-hover:text-violet-700">تطور أحكام الحديث</div>
              <div className="text-xs text-gray-500 mt-1">كيف توزَّعت أحكام العلماء على الأحاديث قرناً بقرن — يكشف ارتفاع أو انخفاض نسبة التصحيح عبر الأجيال</div>
            </Link>
            <Link href="/narrators/family-transmission" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">الرواية العائلية</div>
              <div className="text-xs text-gray-500 mt-1">رواة يشتركون الاسم والنسبة — تعريف أسر الحديث الكبرى ورصد انتقال العلم بين أبناء البيت الواحد</div>
            </Link>
            <Link href="/books/chain-age" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">عمر الأسانيد بالكتب</div>
              <div className="text-xs text-gray-500 mt-1">متوسط المدى الزمني بين الصحابي والمُصنِّف في أسانيد كل كتاب — مقياس لمدى امتداد الرواية ودرجة العلو</div>
            </Link>
            <Link href="/hadiths/narrator-bottleneck" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">الراوي الوحيد — نقطة الضعف</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث تمر جميع أسانيدها بشخص واحد — راوٍ منفرد يحمل الحديث في حلقة محورية لا يمكن تجاوزها</div>
            </Link>
            <Link href="/books/isnad-diversity" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">تنوع المصادر الصحابية</div>
              <div className="text-xs text-gray-500 mt-1">عدد الصحابة الذين يُروى عنهم في كل كتاب — مؤشر شمول الكتاب وتنوع مصادره مقارنةً بسائر المصنَّفات</div>
            </Link>
            <Link href="/narrators/generation-bridge" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">رواة الجسور — حمَلة الإسناد</div>
              <div className="text-xs text-gray-500 mt-1">تابعون سمعوا من كبار الصحابة ونقلوا إلى المحدثين المتأخرين — أعمدة الوصل بين عصر النبوة وعصر التدوين</div>
            </Link>
            <Link href="/hadiths/companion-overlap" className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-emerald-900 text-sm group-hover:text-emerald-700">تشارك الصحابة في الروايات</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث رواها أكثر من صحابي — أداة بحث التواتر والتعدد الصحابي في مسائل الفقه والعقيدة والشريعة</div>
            </Link>
            <Link href="/scholars/isnad-criteria" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">معايير قبول الإسناد بالعلماء</div>
              <div className="text-xs text-gray-500 mt-1">تحليل منهج كل محدث في التصحيح والتضعيف — نسبة القبول ومتوسط طول الأسانيد التي قبلها مع تفاصيل الصيغ</div>
            </Link>
            <Link href="/hadiths/matn-keywords" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">الأحاديث بالموضوع الكلمي</div>
              <div className="text-xs text-gray-500 mt-1">12 موضوعاً كبيراً بكلماتها المفتاحية: النية، الرحمة، التوحيد، الصلاة، الصيام، الزكاة، الحج، العلم، الأخلاق...</div>
            </Link>
            <Link href="/narrators/sahabi-students" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">شبكة تلاميذ الصحابة</div>
              <div className="text-xs text-gray-500 mt-1">أوسع الصحابة شبكةً من التلاميذ المباشرين — يُظهر مَن نشر السنة في الجيل الثاني وكيف توزَّعت طرق الرواية</div>
            </Link>
            <Link href="/hadiths/abrogation" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">فهرس الناسخ والمنسوخ</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث أشار إليها العلماء بالنسخ — ناسخ أو منسوخ أو متقدم ومتأخر — أداة لبحث تاريخ تطور الأحكام الفقهية</div>
            </Link>
            <Link href="/narrators/mudallis-catalog" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-red-900 text-sm group-hover:text-red-700">فهرس المدلِّسين</div>
              <div className="text-xs text-gray-500 mt-1">رواة وُصفوا بالتدليس مع أحاديثهم — أداة للباحث في تمييز عنعنة المدلِّس وتقييم أثرها على صحة الحديث</div>
            </Link>
            <Link href="/hadiths/single-companion" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">أحاديث الآحاد الصحابي</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث لم يرويها إلا صحابي واحد — مصنَّفة بالموضوع الفقهي وعدد الأسانيد — جوهر بحث الغريب والفرد في الحديث</div>
            </Link>
            <Link href="/hadiths/conditional-hadiths" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">أحاديث الأساليب الشرعية</div>
              <div className="text-xs text-gray-500 mt-1">تصنيف الأحاديث بأسلوبها: الثواب (من فعل فله)، التحذير، الشرط، النهي، الأمر، التعريف — لدراسة أساليب التشريع</div>
            </Link>
            <Link href="/narrators/prolific-students" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">المكثرون من الشيوخ</div>
              <div className="text-xs text-gray-500 mt-1">رواة تتلمذوا على أكبر عدد من الشيوخ — يكشف من كان أوسعهم في طلب العلم وأكثرهم تحملاً من مصادر متعددة</div>
            </Link>
            <Link href="/hadiths/prophetic-commands" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">الأوامر والنواهي النبوية</div>
              <div className="text-xs text-gray-500 mt-1">استخراج أحاديث الأوامر الصريحة والنواهي وأحاديث الفعل النبوي (كان يفعل) — أداة لدراسة أساليب التشريع النبوي</div>
            </Link>
            <Link href="/narrators/death-decade" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">الرواة حسب عقد الوفاة</div>
              <div className="text-xs text-gray-500 mt-1">خط زمني للمحدثين موزَّعاً على عقود الهجرة — يكشف أوج الطبقات وتركُّز النشاط الحديثي في كل فترة</div>
            </Link>
            <Link href="/hadiths/divergent-judgments" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">اختلاف العلماء في التصحيح</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث صحَّحها بعض العلماء وضعَّفها آخرون — لدراسة أسباب الخلاف المنهجية في نقد الحديث</div>
            </Link>
            <Link href="/narrators/city-network" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">شبكة الرواية بين المدن</div>
              <div className="text-xs text-gray-500 mt-1">مسارات انتقال الحديث بين المدن الإسلامية — تكشف تدفق العلم من مكة والمدينة نحو العراق وخراسان</div>
            </Link>
            <Link href="/hadiths/opening-variants" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-purple-900 text-sm group-hover:text-purple-700">الروايات المتشابهة في المتن</div>
              <div className="text-xs text-gray-500 mt-1">يجمع الأحاديث المتشابهة في الفاتحة ليكشف اختلاف ألفاظ الرواية بين الكتب — لدراسة الأداء والضبط</div>
            </Link>
            <Link href="/hadiths/grade-by-book" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">درجات الأحاديث بالكتاب</div>
              <div className="text-xs text-gray-500 mt-1">نسب الصحيح والحسن والضعيف في كل كتاب — مؤشر إحصائي لموثوقية كل مصنَّف ودراسة تخصصه</div>
            </Link>
            <Link href="/narrators/teacher-student-pairs" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">ثنائيات الشيخ والتلميذ</div>
              <div className="text-xs text-gray-500 mt-1">الأزواج الأكثر تكراراً من شيخ وتلميذه المباشر — يكشف أهم حلقات الرواية وأعمدة نقل الحديث</div>
            </Link>
            <Link href="/hadiths/takhrij-spread" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">انتشار الأحاديث بالتخريج</div>
              <div className="text-xs text-gray-500 mt-1">الأحاديث المُخرَّجة في أكثر من كتاب — يسهل المقارنة بين روايات الكتب ويرصد درجة الشهرة</div>
            </Link>
            <Link href="/scholars/judgment-phrases" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">معجم صيغ الحكم عند العلماء</div>
              <div className="text-xs text-gray-500 mt-1">الصيغ التي استخدمها كل عالم في الحكم على الأحاديث — يكشف المنهج النقدي لكل محدِّث وأسلوبه في التعبير</div>
            </Link>
            <Link href="/narrators/grade-distribution" className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-slate-900 text-sm group-hover:text-slate-700">توزيع درجات الرواة بالقرون</div>
              <div className="text-xs text-gray-500 mt-1">نسب الثقات والصدوقين والضعفاء والمجاهيل في كل قرن — يرصد تطور جودة رجال الإسناد عبر التاريخ</div>
            </Link>
            <Link href="/hadiths/chain-diversity" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">تنوع الأسانيد في الحديث</div>
              <div className="text-xs text-gray-500 mt-1">لكل حديث: عدد الرواة المختلفين في كل موضع من مواضع السند — يحدد نقاط القوة والضعف الهيكلي</div>
            </Link>
            <Link href="/narrators/contested" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">المختلف فيهم من الرواة</div>
              <div className="text-xs text-gray-500 mt-1">رواة مدحهم بعض العلماء وجرحهم آخرون — لدراسة الخلاف في الجرح والتعديل وموازنة أقوال المحدثين</div>
            </Link>
            <Link href="/hadiths/text-length" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">توزيع أطوال نصوص الأحاديث</div>
              <div className="text-xs text-gray-500 mt-1">كيف تتوزع الأحاديث حسب طول نصها وأي الكتب تحوي أحاديث مطوَّلة — مؤشر لأسلوب التصنيف</div>
            </Link>
            <Link href="/hadiths/book-companion-matrix" className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-orange-900 text-sm group-hover:text-orange-700">مصفوفة الكتب والصحابة</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث كل صحابي في كل كتاب — يكشف تخصص كل مصنَّف ومدى تنوع مصادره الصحابية</div>
            </Link>
            <Link href="/hadiths/unique-to-book" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">انفرادات الكتب</div>
              <div className="text-xs text-gray-500 mt-1">أحاديث موجودة في كتاب واحد فقط — تكشف الخصائص الفريدة لكل مصنَّف وما تميَّز بجمعه</div>
            </Link>
            <Link href="/narrators/short-chains" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">الأسانيد العالية — قِصار السند</div>
              <div className="text-xs text-gray-500 mt-1">الثلاثيات والرباعيات وغيرها — أعلى الأسانيد إسناداً وأقلها احتمالاً للانقطاع والخطأ</div>
            </Link>
            <Link href="/books/author-profile" className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-slate-900 text-sm group-hover:text-slate-700">الملف الإحصائي للكتاب</div>
              <div className="text-xs text-gray-500 mt-1">بصمة كل كتاب: أحاديثه وتنوع صحابته ومتوسط أسانيده ونسب درجاته — مقارنة شاملة بين المصنَّفات</div>
            </Link>
            <Link href="/narrators/tabiin-ranking" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-teal-900 text-sm group-hover:text-teal-700">ترتيب التابعين — شيوخاً وتلاميذ</div>
              <div className="text-xs text-gray-500 mt-1">التابعون مرتَّبون بمعيار مركَّب: صحابة سمع منهم × تلاميذ × أحاديث — يحدد أعمدة نقل السنة في جيلهم</div>
            </Link>
            <Link href="/books/chapter-analysis" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-blue-900 text-sm group-hover:text-blue-700">تحليل الأبواب في كل كتاب</div>
              <div className="text-xs text-gray-500 mt-1">فهرس الأبواب لكل كتاب مع عدد أحاديث كل باب ونسب الصحيح والضعيف فيه — للإحاطة بمحتوى الكتاب</div>
            </Link>
            <Link href="/narrators/companion-last" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-amber-900 text-sm group-hover:text-amber-700">آخر الصحابة وفاةً</div>
              <div className="text-xs text-gray-500 mt-1">الصحابة الذين أطال الله أعمارهم وأدركهم التابعون المتأخرون — من أهم جسور نقل السنة عبر الأجيال</div>
            </Link>
            <Link href="/hadiths/chain-quality" className="bg-[#FFFDF7] border border-[#D9C9A8] rounded-xl px-4 py-3 hover:border-[#C9A96B] hover:shadow-sm transition-all group">
              <div className="font-semibold text-green-900 text-sm group-hover:text-green-700">فلتر جودة الأسانيد</div>
              <div className="text-xs text-gray-500 mt-1">فلتر الأحاديث بمعايير نوعية: كل رواته ثقات، لا ضعيف فيه، ≥5 أسانيد، سند قصير، أو متعدد الصحابة</div>
            </Link>
            <Link href="/scholars/early-vs-late" className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-indigo-900 text-sm group-hover:text-indigo-700">منهج العلماء عبر القرون</div>
              <div className="text-xs text-gray-500 mt-1">هل كان علماء القرن الثالث أشد تضعيفاً من علماء القرن الرابع؟ مقارنة إحصائية لنسب التصحيح والتضعيف بالأجيال</div>
            </Link>
            <Link href="/narrators/most-cited" className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 hover:border-violet-300 hover:shadow-sm transition-all group">
              <div className="font-semibold text-violet-900 text-sm group-hover:text-violet-700">الرواة الأكثر انتشاراً</div>
              <div className="text-xs text-gray-500 mt-1">ليس بعدد أحاديثهم — بل بعدد الكتب التي رُويت فيها أحاديثهم — مقياس حقيقي لمكانة الراوي في التراث الحديثي</div>
            </Link>
          </div>
        </div>

        {/* Research tips */}
        <div className="mt-6 bg-amber-50 rounded-2xl border border-amber-100 p-6">
          <h2 className="text-base font-bold text-amber-900 mb-3">ملاحظات للباحثين</h2>
          <ul className="text-sm text-amber-800 space-y-2 leading-relaxed list-disc list-inside">
            <li>كل راوٍ يعرض ترجمته من كتب التراجم الكبرى (تهذيب الكمال، الكاشف، تقريب التهذيب...)</li>
            <li>قسم «جرح وتعديل» يجمع أقوال العلماء مع <strong>درجة الجرح أو التعديل</strong> من جانب كل قول</li>
            <li>الأسانيد تربط كل حديث برواته مع روابط مباشرة لصفحة كل راوٍ</li>
            <li>البحث يدعم <strong>البحث المركَّب</strong>: نص + راوٍ معاً للوصول لأحاديث راوٍ بعينه تتضمن لفظاً محدداً</li>
            <li><strong>تتبع الإسناد</strong>: ابحث عن أحاديث تجمع راويَين أو أكثر في سند واحد لتحليل مسارات الرواية</li>
            <li>تصفح نصوص <strong>كتب التراجم</strong> مباشرة عبر قسم «التراجم» في الشريط العلوي</li>
            <li>كل كتاب يعرض <strong>فهرساً تفصيلياً بالأبواب</strong> مع إمكانية الانتقال برقم الحديث</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

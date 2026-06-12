import Link from 'next/link'
import pool from '@/lib/db'
import HomeSearch from '@/app/components/HomeSearch'

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
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-10 text-center">
        <div className="inline-block bg-green-900 text-amber-200 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide">
          برنامج خادم الحرمين الشريفين
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-green-900 mb-4 leading-tight">
          موسوعة الحديث النبوي الشريف
        </h1>
        <p className="text-gray-600 text-lg mb-10 max-w-xl mx-auto">
          قاعدة بيانات متكاملة لباحثي الحديث في مراحل الماجستير والدكتوراه
        </p>

        <HomeSearch />

        {/* Quick examples */}
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-gray-500">
          <span>جرب:</span>
          {['إنما الأعمال بالنيات', 'من كذب علي', 'الطهور شطر الإيمان'].map(ex => (
            <Link key={ex} href={`/search?q=${encodeURIComponent(ex)}`}
              className="text-green-700 hover:underline">
              {ex}
            </Link>
          ))}
        </div>
      </div>

      {/* Stats banner */}
      <div className="bg-green-900 text-white py-6">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
          {[
            { num: hadiths.toLocaleString('ar-EG'), label: 'حديث' },
            { num: narrators.toLocaleString('ar-EG'), label: 'راوٍ' },
            { num: books.toString(), label: 'كتاب' },
            { num: topics.toLocaleString('ar-EG'), label: 'موضوع' },
            { num: bio.toLocaleString('ar-EG'), label: 'راوٍ مترجَم' },
            { num: criticism.toLocaleString('ar-EG'), label: 'راوٍ مجروح/معدَّل' },
          ].map((s, i) => (
            <div key={i}>
              <div className="text-2xl font-bold text-amber-300">{s.num}</div>
              <div className="text-xs text-green-200 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Nav Cards */}
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          <Link href="/books" className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-green-300 transition-all group">
            <div className="text-3xl mb-3">📚</div>
            <div className="font-bold text-green-900 group-hover:text-green-700">تصفح الكتب</div>
            <div className="text-sm text-gray-500 mt-1">{books} كتاباً من أمهات المصادر</div>
          </Link>
          <Link href="/narrators" className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-green-300 transition-all group">
            <div className="text-3xl mb-3">👤</div>
            <div className="font-bold text-green-900 group-hover:text-green-700">علم الرجال</div>
            <div className="text-sm text-gray-500 mt-1">{narrators.toLocaleString('ar-EG')} راوٍ مع ترجمة وجرح وتعديل</div>
          </Link>
          <Link href="/search" className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-green-300 transition-all group">
            <div className="text-3xl mb-3">🔍</div>
            <div className="font-bold text-green-900 group-hover:text-green-700">البحث المتقدم</div>
            <div className="text-sm text-gray-500 mt-1">بحث نصي مع تصفية بالكتاب</div>
          </Link>
          <Link href="/topics" className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-green-300 transition-all group">
            <div className="text-3xl mb-3">🗂</div>
            <div className="font-bold text-green-900 group-hover:text-green-700">الفهارس الموضوعية</div>
            <div className="text-sm text-gray-500 mt-1">{topics.toLocaleString('ar-EG')} موضوع مصنَّف</div>
          </Link>
          <Link href="/lexicon" className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-green-300 transition-all group">
            <div className="text-3xl mb-3">📖</div>
            <div className="font-bold text-green-900 group-hover:text-green-700">غريب الحديث</div>
            <div className="text-sm text-gray-500 mt-1">{lexicon.toLocaleString('ar-EG')} لفظة معتمدة</div>
          </Link>
          <Link href="/narrators?sort=hadiths" className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-green-300 transition-all group">
            <div className="text-3xl mb-3">📊</div>
            <div className="font-bold text-green-900 group-hover:text-green-700">أكثر الرواة حديثاً</div>
            <div className="text-sm text-gray-500 mt-1">مرتب حسب عدد الأحاديث</div>
          </Link>
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
              className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-700 font-medium text-sm hover:border-green-300 hover:shadow-sm transition-all">
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

        {/* Research tips */}
        <div className="mt-6 bg-amber-50 rounded-2xl border border-amber-100 p-6">
          <h2 className="text-base font-bold text-amber-900 mb-3">ملاحظات للباحثين</h2>
          <ul className="text-sm text-amber-800 space-y-2 leading-relaxed list-disc list-inside">
            <li>كل راوٍ يعرض ترجمته من كتب التراجم الكبرى (تهذيب الكمال، الكاشف، تقريب التهذيب...)</li>
            <li>قسم «جرح وتعديل» يجمع أقوال العلماء في الراوي من مصادرها الأصلية</li>
            <li>الأسانيد تربط كل حديث برواته مع روابط مباشرة لصفحة كل راوٍ</li>
            <li>يمكن تصفية الرواة بالدرجة (ثقة، صدوق، ضعيف، مجهول) وبالطبقة والوفاة</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

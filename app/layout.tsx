import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'جامع خادم الحرمين الشريفين',
  description: 'موسوعة الحديث النبوي الشريف — بحث وتحقيق',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Amiri', serif" }} className="bg-amber-50 text-gray-900 min-h-screen">
        <nav className="bg-green-900 text-white px-4 py-3 flex items-center gap-1 shadow-md sticky top-0 z-50 flex-wrap">
          <a href="/" className="text-base font-bold hover:text-amber-200 transition-colors ml-4 shrink-0">
            جامع خادم الحرمين
          </a>
          <div className="flex items-center gap-1 flex-wrap text-sm">
            <a href="/books" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10">الكتب</a>
            <a href="/search" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10">البحث</a>
            <a href="/narrators" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10">الرواة</a>
            <a href="/narrators/stats" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10 text-amber-300/80">إحصاءات</a>
            <a href="/compare" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10 text-amber-300/80">مقارنة</a>
            <a href="/topics" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10">الفهارس</a>
            <a href="/lexicon" className="hover:text-amber-200 transition-colors px-2 py-1 rounded hover:bg-white/10">غريب الحديث</a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-12">
          برنامج خادم الحرمين الشريفين — موسوعة الحديث النبوي الشريف
        </footer>
      </body>
    </html>
  )
}

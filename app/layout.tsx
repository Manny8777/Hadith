import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'جامع خادم الحرمين الشريفين',
  description: 'موسوعة الحديث النبوي الشريف',
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
        <nav className="bg-green-900 text-white px-6 py-3 flex items-center gap-6 shadow-md">
          <a href="/" className="text-xl font-bold hover:text-amber-200 transition-colors">
            جامع خادم الحرمين
          </a>
          <a href="/books" className="hover:text-amber-200 transition-colors">الكتب</a>
          <a href="/search" className="hover:text-amber-200 transition-colors">البحث</a>
          <a href="/narrators" className="hover:text-amber-200 transition-colors">الرواة</a>
          <a href="/topics" className="hover:text-amber-200 transition-colors">الفهارس</a>
          <a href="/lexicon" className="hover:text-amber-200 transition-colors">غريب الحديث</a>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200">
          برنامج خادم الحرمين الشريفين — موسوعة الحديث النبوي
        </footer>
      </body>
    </html>
  )
}

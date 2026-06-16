import type { Metadata } from 'next'
import './globals.css'
import NavHeader from './components/NavHeader'
import SiteNotice from './components/SiteNotice'
import { NumberingProvider } from '@/lib/numberingContext'

export const metadata: Metadata = {
  title: 'جامع خادم الحرمين الشريفين',
  description: 'موسوعة الحديث النبوي الشريف – بحث وتحقيق',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head />
      <body className="bg-amber-50 text-gray-900 min-h-screen">
        <NumberingProvider>
          <header className="sticky top-0 z-50 shadow-md">
            <SiteNotice />
            <NavHeader />
          </header>
          <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        </NumberingProvider>
        <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-12">
          برنامج خادم الحرمين الشريفين – موسوعة الحديث النبوي الشريف
        </footer>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import NavHeader from './components/NavHeader'
import SearchSubHeader, { SearchSubHeaderFallback } from './components/SearchSubHeader'
import SiteNotice from './components/SiteNotice'
import NumeralConverter from './components/NumeralConverter'
import { NumberingProvider } from '@/lib/numberingContext'
import { NumeralProvider } from '@/lib/numeralContext'

export const metadata: Metadata = {
  title: 'جامع خادم الحرمين الشريفين',
  description: 'موسوعة الحديث النبوي الشريف – بحث وتحقيق',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head />
      <body className="bg-paper text-ink min-h-screen font-serif">
        <NumberingProvider>
          <NumeralProvider>
            <NumeralConverter />
            <header className="sticky top-0 z-50 shadow-sm">
              <SiteNotice />
              <NavHeader />
              <Suspense fallback={<SearchSubHeaderFallback />}>
                <SearchSubHeader />
              </Suspense>
            </header>
            <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-7 py-5 sm:py-8">{children}</main>
          </NumeralProvider>
        </NumberingProvider>
        <footer className="text-center text-xs text-gray-500 font-sans py-6 border-t border-gray-200 mt-12">
          برنامج خادم الحرمين الشريفين – موسوعة الحديث النبوي الشريف
        </footer>
      </body>
    </html>
  )
}

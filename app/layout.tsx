import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import NavHeader from './components/NavHeader'
import BrandMark from './components/BrandMark'
import SearchSubHeader, { SearchSubHeaderFallback } from './components/SearchSubHeader'
import NumeralConverter from './components/NumeralConverter'
import { NumberingProvider } from '@/lib/numberingContext'
import { NumeralProvider } from '@/lib/numeralContext'
import { ThemeProvider } from '@/lib/themeContext'

// Applied before paint to avoid a flash of the wrong theme.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

export const metadata: Metadata = {
  title: 'جامع خادم الحرمين الشريفين',
  description: 'موسوعة الحديث النبوي الشريف – بحث وتحقيق',
  icons: { icon: { url: '/assets/brand/al-jami-icon.svg', type: 'image/svg+xml' } },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="bg-paper text-ink min-h-screen font-serif">
        <ThemeProvider>
        <NumberingProvider>
          <NumeralProvider>
            <NumeralConverter />
            <header className="sticky top-0 z-50 shadow-sm">
              <NavHeader />
              <Suspense fallback={<SearchSubHeaderFallback />}>
                <SearchSubHeader />
              </Suspense>
            </header>
            <main className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">{children}</main>
          </NumeralProvider>
        </NumberingProvider>
        </ThemeProvider>
        <div id="report-print-root" className="report-print-root" />
        <footer className="site-footer theme-texture">
          <div className="site-footer-inner">
            <span className="brand-tile"><BrandMark size={44} /></span>
            <div>
              <p className="font-display text-lg">برنامج خادم الحرمين الشريفين</p>
              <p className="font-sans text-xs opacity-75">موسوعة الحديث النبوي الشريف</p>
            </div>
            <img src="/assets/theme-ornament.svg" alt="" width="240" height="24" className="site-footer-ornament" />
          </div>
        </footer>
      </body>
    </html>
  )
}

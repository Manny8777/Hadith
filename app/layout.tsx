import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import NavHeader from './components/NavHeader'
import BrandMark from './components/BrandMark'
import SearchSubHeader, { SearchSubHeaderFallback } from './components/SearchSubHeader'
import NumeralConverter from './components/NumeralConverter'
import Analytics from './components/Analytics'
import InstallApp, { InstallButton } from './components/InstallApp'
import LibraryImport from './components/LibraryImport'
import { NumberingProvider } from '@/lib/numberingContext'
import { NumeralProvider } from '@/lib/numeralContext'
import { ThemeProvider } from '@/lib/themeContext'
import { SITE_NAME, SITE_DESCRIPTION, openGraph, twitter } from '@/lib/siteMeta'

// Applied before paint to avoid a flash of the wrong theme. The site opens in the light theme;
// dark only when the reader has chosen it (the system's dark preference is not followed).
const THEME_INIT = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`

// metadataBase makes link-preview URLs absolute; SITE_URL overrides it outside production.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://hadith.dev'),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  icons: {
    icon: { url: '/assets/brand/al-jami-icon.svg', type: 'image/svg+xml' },
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
  },
  // Installed on iOS («إضافة إلى الشاشة الرئيسية»): opens full-screen, named «الجامع»
  appleWebApp: { capable: true, title: 'الجامع', statusBarStyle: 'default' },
  // No preview title/description here: pages inherit the image and site name, while previews of a
  // page that only sets its own <title>/description fall back to those rather than the site's.
  openGraph: openGraph(),
  twitter: twitter(),
}

// The browser bar and the installed app's title bar take the site's green
export const viewport: Viewport = { themeColor: '#0F3D2E' }

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
            <Analytics />
            <InstallApp />
            <LibraryImport />
            {/* The slim bar, and under it the site-wide search box (useSearchParams, so in Suspense) */}
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
              <p className="font-sans text-xs mt-1">
                للتواصل عبر واتساب:{' '}
                <a href="https://wa.me/61426047327" target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-80" dir="ltr">
                  +61 426 047 327
                </a>
              </p>
              <InstallButton label="ثبّت الجامع كتطبيق" className="font-sans text-xs mt-2 inline-flex items-center gap-1.5 underline underline-offset-2 hover:opacity-80" />
            </div>
            <img src="/assets/theme-ornament.svg" alt="" width="240" height="24" className="site-footer-ornament" />
          </div>
        </footer>
      </body>
    </html>
  )
}

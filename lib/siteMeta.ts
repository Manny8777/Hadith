import type { Metadata } from 'next'

// Shared link-preview (Open Graph / X card) settings. A page's openGraph and twitter objects replace
// the layout's rather than merging with them, so pages that set their own build on these.
export const SITE_NAME = 'جامع خادم الحرمين الشريفين'
export const SITE_DESCRIPTION = 'موسوعة الحديث النبوي الشريف – بحث وتحقيق'

// A light 1200×630 card — WhatsApp skips preview images over ~300 KB
const SHARE_IMAGE = { url: '/assets/brand/share-card.jpg', width: 1200, height: 630, alt: SITE_NAME }

export function openGraph(og: NonNullable<Metadata['openGraph']> = {}): Metadata['openGraph'] {
  return { siteName: SITE_NAME, locale: 'ar_AR', type: 'website', images: [SHARE_IMAGE], ...og }
}

export function twitter(tw: NonNullable<Metadata['twitter']> = {}): Metadata['twitter'] {
  return { card: 'summary_large_image', images: [SHARE_IMAGE.url], ...tw }
}

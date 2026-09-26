import { expect, test } from '@playwright/test'

const productionLike = process.env.PLAYWRIGHT_BASE_URL

function collectPageErrors(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test.describe('Hadith core browser journeys', () => {
  test('search keeps Arabic query and URL filters shareable', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/search?q=الصلاة')
    await expect(page.getByRole('heading', { name: 'البحث في الأحاديث' })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'نص البحث' })).toHaveValue('الصلاة')
    await page.getByRole('button', { name: 'حفظ البحث الحالي' }).click()
    await expect(page.getByRole('status')).toHaveText('تم حفظ البحث')
    const savedSearches = await page.evaluate(() => JSON.parse(localStorage.getItem('hadith_saved_searches') || '[]'))
    expect(savedSearches.some((entry: { label: string }) => entry.label.includes('الصلاة'))).toBe(true)

    await page.getByRole('button', { name: 'الأطراف فقط' }).click()
    await expect(page).toHaveURL(/search_scope=tarf/)
    await page.goBack()
    await expect(page).not.toHaveURL(/search_scope=tarf/)

    const search = page.getByRole('searchbox', { name: 'نص البحث' })
    await search.fill('الزكاة')
    await expect(search).toHaveValue('الزكاة')
    await page.waitForTimeout(100)
    await search.press('Enter')
    await expect(page).toHaveURL(/q=.*/)
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('الزكاة')
    expect(errors).toEqual([])
  })

  test('service search renders the catalogue result set', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/search?q=الصلاة&src=service')
    await expect(page.getByRole('heading', { name: 'البحث في الأحاديث' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'الكتب الخدمية (شروح وتراجم وجرح وتعديل)' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '1', exact: true }).first()).toBeVisible({ timeout: 30_000 })
    expect(await page.locator('body').innerText()).not.toContain('حدث خطأ')
    expect(errors).toEqual([])
  })

  test('topic direct-hadith view reaches a hadith record', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/topics/item/759')
    await expect(page.getByRole('heading', { name: 'صفة أهل النار وجرائمهم' })).toBeVisible()
    await page.getByRole('link', { name: /الأحاديث المرتبطة مباشرة/ }).click()
    await expect(page).toHaveURL(/view=hadiths/)
    await expect(page.getByRole('link', { name: /عرض الحديث كاملاً/ }).first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('link', { name: /عرض الحديث كاملاً/ }).first().click()
    await expect(page).toHaveURL(/\/hadith\/\d+/)
    await expect(page.getByRole('button', { name: 'نسخ رابط الحديث' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'طباعة الحديث' })).toBeVisible()
    // The search-tools links live inside a section that starts closed and only mounts its
    // children on first open, so the section has to be expanded before the link exists.
    await page.getByRole('button', { name: /أدوات البحث/ }).click()
    await expect(page.getByRole('link', { name: /مقارنة الألفاظ.*الفروق المصنَّفة/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('narrator report exposes bounded copy, download, and print actions', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/narrator/9')
    await expect(page.getByRole('button', { name: 'نسخ للبحث' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'تنزيل TXT' })).toBeVisible()
    await expect(page.getByRole('button', { name: /طباعة التقرير/ })).toBeVisible()

    await page.getByRole('button', { name: 'نسخ للبحث' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'تنزيل TXT' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.txt')
    await page.getByRole('button', { name: /طباعة التقرير/ }).click()
    expect(errors).toEqual([])
  })

  test('mobile narrator page contains its horizontal navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile viewport project only')
    const errors = collectPageErrors(page)
    await page.goto('/narrator/9')
    await expect(page.getByRole('heading', { name: 'موسوعة الحديث الشريف' })).toBeVisible()
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      dir: document.documentElement.dir,
    }))
    expect(layout.dir).toBe('rtl')
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1)
    expect(errors).toEqual([])
  })

  test('empty search state explains how to broaden the query', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.goto('/search?q=لاشيءمطلقا&search_scope=tarf')
    await expect(page.getByText('لا توجد نتائج')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /جرّب البحث في المتن كاملاً/ })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('health and core route surfaces are reachable', async ({ page }) => {
    const response = await page.goto('/api/health')
    expect(response?.status()).toBe(200)
    const payload = await response?.json()
    expect(payload).toMatchObject({ status: 'ok', database: 'reachable' })
    expect(await page.locator('body').innerText()).not.toContain('الموقع قيد التطوير')
    expect(productionLike || 'local').toBeTruthy()
  })
})

import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { isAdmin, passwordSet, unlocked } from '@/lib/adminGate'
import UnlockForm from './UnlockForm'
import Dashboard from './Dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الإحصاءات — الجامع', robots: { index: false, follow: false } }

// Private statistics: sign-ups, MCP use and site traffic (Dashboard.tsx). Behind sign-in, an admin
// email (ADMIN_EMAILS) and the ADMIN_PASSWORD (lib/adminGate.ts). Anyone else gets a 404, so the
// page's existence is not shown.

export default async function AdminPage() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/admin')
  if (!isAdmin(user)) notFound()
  if (!(await unlocked(user))) {
    return (
      <div dir="rtl" className="max-w-sm mx-auto ui-card rounded-2xl p-6">
        <h1 className="text-xl font-bold text-green-900 mb-1">الإحصاءات</h1>
        {passwordSet()
          ? <><p className="text-sm text-gray-500 mb-4">أدخل كلمة مرور لوحة الإحصاءات؛ تبقى مفتوحةً ١٢ ساعة.</p><UnlockForm /></>
          : <p className="text-sm text-gray-600 leading-relaxed">اللوحة مقفلة: لم تُضبط كلمة المرور. أضف المتغير <code dir="ltr" className="bg-paper px-1 rounded">ADMIN_PASSWORD</code> في إعدادات الخادم على Railway.</p>}
      </div>
    )
  }
  return (
    <Dashboard lockForm={
      <form action="/api/admin/lock" method="post" className="shrink-0">
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm sm:text-[1.1rem] text-gray-600 hover:border-red-300 hover:text-red-700">قفل</button>
      </form>
    } />
  )
}

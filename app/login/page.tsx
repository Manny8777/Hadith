import { redirect } from 'next/navigation'
import { currentUser, safeNext } from '@/lib/auth'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تسجيل الدخول — الجامع', robots: { index: false } }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  if (await currentUser()) redirect(next)
  return (
    <div dir="rtl" className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-green-900 mb-1">تسجيل الدخول</h1>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        الدخول اختياري، ولا كلمة مرور: نرسل إلى بريدك رابطًا تدخل به. يرفع الحساب حدّ الاستعمال اليومي لخادم
        <a href="/developers#mcp" className="text-green-700 hover:underline mx-1">MCP</a>
        ويتيح لك رموزًا شخصية له.
      </p>
      <div className="ui-card rounded-2xl p-5">
        <LoginForm next={next} expired={sp.error === 'expired'} />
      </div>
    </div>
  )
}

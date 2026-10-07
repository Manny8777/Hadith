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
        الدخول اختياري، ولا كلمة مرور: نرسل إلى بريدك رابطًا تدخل به. والحساب مجاني، ويمنحك «مكتبتي»: مجموعاتك البحثية،
        وملاحظاتك ووسومك وتظليلاتك على الأحاديث، وتصدير مراجعك إلى Zotero وEndNote وLaTeX — محفوظةً على كل أجهزتك؛
        ويرفع حدّ الاستعمال اليومي لخادم
        <a href="/developers#mcp" className="text-green-700 hover:underline mx-1">MCP</a>.
      </p>
      <div className="ui-card rounded-2xl p-5">
        <LoginForm next={next} expired={sp.error === 'expired'} />
      </div>
      {/* what an account gives: the «مكتبتي» film (motion-graphics/library) */}
      <video controls preload="none" playsInline poster="/media/library-poster.jpg" aria-label="مكتبتي — المكتبة البحثية"
        className="mt-6 w-full aspect-video rounded-xl border border-[#D9C9A8] bg-[#0F3D2E]">
        <source src="/media/library.mp4" type="video/mp4" />
        <track kind="captions" src="/media/library.ar.vtt" srcLang="ar" label="العربية" />
      </video>
    </div>
  )
}

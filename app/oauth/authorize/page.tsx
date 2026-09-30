import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getClient } from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'السماح بالوصول — الجامع', robots: { index: false } }

type Sp = Record<string, string | undefined>

// OAuth authorization endpoint: an MCP client (Claude, ChatGPT…) sends the reader here to sign in and
// allow it to use the MCP server on their account. The approval posts to /api/oauth/authorize.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams
  const client = sp.client_id ? await getClient(sp.client_id).catch(() => null) : null
  const problem =
    !client ? 'تطبيقٌ غير معروف (client_id)' :
    sp.response_type !== 'code' ? 'response_type يجب أن يكون code' :
    !sp.redirect_uri || !client.redirect_uris.includes(sp.redirect_uri) ? 'عنوان الرجوع (redirect_uri) غير مسجَّل لهذا التطبيق' :
    !sp.code_challenge || sp.code_challenge_method !== 'S256' ? 'يلزم PKCE بطريقة S256' : null
  if (problem) {
    return (
      <div dir="rtl" className="max-w-md mx-auto ui-card rounded-2xl p-6">
        <h1 className="text-xl font-bold text-red-800 mb-2">طلبٌ غير صالح</h1>
        <p className="text-sm text-gray-600">{problem}</p>
      </div>
    )
  }

  const user = await currentUser()
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][])}`
    redirect(`/login?next=${encodeURIComponent(here)}`)
  }

  const hidden = ['client_id', 'redirect_uri', 'code_challenge', 'state', 'scope', 'resource'] as const
  return (
    <div dir="rtl" className="max-w-md mx-auto ui-card rounded-2xl p-6">
      <h1 className="text-xl font-bold text-green-900 mb-2">السماح بالوصول</h1>
      <p className="text-sm text-gray-700 leading-relaxed mb-1">
        يطلب <b>{client!.client_name || 'تطبيق MCP'}</b> استعمال خادم «الجامع» (MCP) باسم حسابك:
      </p>
      <p className="text-sm text-gray-500 mb-4" dir="ltr">{user.email}</p>
      <ul className="text-sm text-gray-600 list-disc pr-5 mb-5 space-y-1">
        <li>قراءة الأحاديث والرواة والتخريج فقط — لا يغيّر شيئًا في حسابك.</li>
        <li>يُحتسب استعماله من حدّك اليومي المرتفع.</li>
        <li>تستطيع إلغاءه متى شئت بتسجيل الخروج من التطبيق.</li>
      </ul>
      <p className="text-xs text-gray-400 mb-4 break-all" dir="ltr">↩ {sp.redirect_uri}</p>
      <form action="/api/oauth/authorize" method="post" className="flex gap-2">
        {hidden.map(k => sp[k] != null && <input key={k} type="hidden" name={k} value={sp[k]} />)}
        <button name="decision" value="allow" className="flex-1 rounded-lg bg-green-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-900">سماح</button>
        <button name="decision" value="deny" className="rounded-lg border border-border px-4 py-2.5 text-sm text-gray-700 hover:border-red-300">رفض</button>
      </form>
    </div>
  )
}

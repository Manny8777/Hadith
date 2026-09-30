import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { getClient, issueCode } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

// The consent form of app/oauth/authorize: on «سماح» issue a code and return to the client
export async function POST(req: Request) {
  const f = await req.formData()
  const get = (k: string) => String(f.get(k) ?? '')
  const client = await getClient(get('client_id')).catch(() => null)
  const redirectUri = get('redirect_uri')
  if (!client || !client.redirect_uris.includes(redirectUri) || !get('code_challenge')) {
    return new Response('invalid request', { status: 400 })
  }
  const back = new URL(redirectUri)
  if (get('state')) back.searchParams.set('state', get('state'))

  const user = await currentUser()
  if (!user || get('decision') !== 'allow') {
    back.searchParams.set('error', 'access_denied')
    return NextResponse.redirect(back, 303)
  }
  back.searchParams.set('code', await issueCode(client.client_id, user.id, redirectUri, get('code_challenge')))
  return NextResponse.redirect(back, 303)
}

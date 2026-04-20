import { getSession } from '@/lib/session'
import { cancelLogin } from '@/lib/praamid-login'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  await cancelLogin(session.user.id)
  return Response.json({ ok: true })
}

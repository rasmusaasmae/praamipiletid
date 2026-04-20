import { getSession } from '@/lib/session'
import { getLoginState } from '@/lib/praamid-login'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const state = getLoginState(session.user.id)
  if (!state) {
    return Response.json({ state: { kind: 'none' } })
  }
  return Response.json({ state })
}

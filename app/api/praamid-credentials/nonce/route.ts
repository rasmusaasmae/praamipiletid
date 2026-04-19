import { getSession } from '@/lib/session'
import { issueCsrfNonce } from '@/lib/praamid-csrf'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const nonce = await issueCsrfNonce(session.user.id)
  return Response.json({ nonce })
}

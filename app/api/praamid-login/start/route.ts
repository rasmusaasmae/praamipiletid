import { z } from 'zod'
import { getSession } from '@/lib/session'
import { startLogin } from '@/lib/praamid-login'
import { isikukoodSchema } from '@/lib/schemas'

const schema = z.object({ isikukood: isikukoodSchema })

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'invalid_isikukood' }, { status: 400 })
  }
  try {
    await startLogin(session.user.id, parsed.data.isikukood)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'start_failed'
    return Response.json({ error: message }, { status: 500 })
  }
  return Response.json({ ok: true })
}

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { NavBar } from '@/components/nav-bar'
import { auth } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')
  return (
    <div className="flex flex-1 flex-col">
      <NavBar
        user={{
          email: session.user.email,
          image: session.user.image ?? null,
        }}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}

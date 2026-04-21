import { NavBar } from '@/components/nav-bar'
import { AppProviders } from '@/components/app-providers'
import { requireUser } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser()
  return (
    <AppProviders>
      <div className="flex flex-1 flex-col">
        <NavBar
          user={{
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
            role: session.user.role ?? 'user',
          }}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </div>
    </AppProviders>
  )
}

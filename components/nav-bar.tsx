import Link from 'next/link'
import { SignOutButton } from '@/components/sign-out-button'

type Props = {
  user: { name: string; email: string; role: string }
}

export function NavBar({ user }: Props) {
  const isAdmin = user.role === 'admin'
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/trips" className="font-semibold">
            Praamipiletid
          </Link>
          <nav className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href="/trips" className="hover:text-foreground">
              Reisid
            </Link>
            <Link href="/subscriptions" className="hover:text-foreground">
              Tellimused
            </Link>
            <Link href="/settings" className="hover:text-foreground">
              Seaded
            </Link>
            {isAdmin ? (
              <Link href="/admin" className="hover:text-foreground">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.email}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

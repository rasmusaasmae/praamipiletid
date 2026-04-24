import { Ship } from 'lucide-react'
import Link from 'next/link'
import { AvatarMenu } from '@/components/avatar-menu'

type Props = {
  user: { email: string; image: string | null; role: string }
}

export function NavBar({ user }: Props) {
  const isAdmin = user.role === 'admin'
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Ship className="size-5" aria-hidden />
            Ferry Tickets
          </Link>
          {isAdmin ? (
            <nav className="flex items-center gap-2 text-sm text-muted-foreground sm:gap-3">
              <Link href="/" className="hover:text-foreground">
                Home
              </Link>
              <Link href="/admin" className="hover:text-foreground">
                Admin
              </Link>
            </nav>
          ) : null}
        </div>
        <AvatarMenu user={{ email: user.email, image: user.image }} />
      </div>
    </header>
  )
}

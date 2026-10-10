import { Ship } from 'lucide-react'
import Link from 'next/link'

import { AvatarMenu } from '@/components/avatar-menu'

type Props = {
  user: { email: string; image: string | null }
}

export function NavBar({ user }: Props) {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Ship className="size-5" aria-hidden />
          Ferry Tickets
        </Link>
        <AvatarMenu user={user} />
      </div>
    </header>
  )
}

'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { updateUserRole } from '@/actions/admin'

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  createdAt: Date
  subCount: number
}

export function AdminUsersTable({ users }: { users: UserRow[] }) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Admin')
  const locale = useLocale()

  const toggleRole = (userId: string, current: string) => {
    const form = new FormData()
    form.set('userId', userId)
    form.set('role', current === 'admin' ? 'user' : 'admin')
    startTransition(async () => {
      const res = await updateUserRole(form)
      if (res.ok) toast.success(t('roleChanged'))
      else toast.error(res.error)
    })
  }

  if (users.length === 0) {
    return <p className="text-muted-foreground">{t('usersEmpty')}</p>
  }

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnUser')}</TableHead>
            <TableHead>{t('columnRole')}</TableHead>
            <TableHead>{t('columnSubCount')}</TableHead>
            <TableHead>{t('columnCreated')}</TableHead>
            <TableHead className="text-right">{t('columnActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </TableCell>
              <TableCell>
                {u.role === 'admin' ? (
                  <Badge>{t('admin')}</Badge>
                ) : (
                  <Badge variant="outline">{t('user')}</Badge>
                )}
                {u.banned ? (
                  <Badge variant="destructive" className="ml-1">
                    {t('banned')}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{u.subCount}</TableCell>
              <TableCell>{u.createdAt.toLocaleDateString(dateTag)}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => toggleRole(u.id, u.role)}
                >
                  {u.role === 'admin' ? t('roleToUser') : t('roleToAdmin')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

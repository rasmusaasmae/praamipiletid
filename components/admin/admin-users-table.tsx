'use client'

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
import { useOptimisticMutation } from '@/lib/mutations'
import { adminDashboardQueryOptions, type AdminDashboardData } from '@/lib/query-options'

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
  const t = useTranslations('Admin')
  const locale = useLocale()

  const toggleRoleMutation = useOptimisticMutation<
    { userId: string; nextRole: 'admin' | 'user' },
    AdminDashboardData
  >({
    queryKey: adminDashboardQueryOptions.queryKey,
    action: ({ userId, nextRole }) => {
      const form = new FormData()
      form.set('userId', userId)
      form.set('role', nextRole)
      return updateUserRole(form)
    },
    optimisticUpdate: (old, { userId, nextRole }) => ({
      ...old,
      users: old.users.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)),
    }),
    successMessage: t('roleChanged'),
  })

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
                  onClick={() =>
                    toggleRoleMutation.mutate({
                      userId: u.id,
                      nextRole: u.role === 'admin' ? 'user' : 'admin',
                    })
                  }
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

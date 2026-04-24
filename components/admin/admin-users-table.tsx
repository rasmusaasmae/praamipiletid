'use client'

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

const DATE_TAG = 'en-GB'

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
  const toggleRoleMutation = useOptimisticMutation<
    { userId: string; nextRole: 'admin' | 'user' },
    AdminDashboardData
  >({
    queryKey: adminDashboardQueryOptions.queryKey,
    mutationFn: ({ userId, nextRole }) => updateUserRole({ userId, role: nextRole }),
    optimisticUpdate: (old, { userId, nextRole }) => ({
      ...old,
      users: old.users.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)),
    }),
    successMessage: 'Role changed',
  })

  if (users.length === 0) {
    return <p className="text-muted-foreground">No users.</p>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Tickets</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
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
                  <Badge>admin</Badge>
                ) : (
                  <Badge variant="outline">user</Badge>
                )}
                {u.banned ? (
                  <Badge variant="destructive" className="ml-1">
                    banned
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{u.subCount}</TableCell>
              <TableCell>{u.createdAt.toLocaleDateString(DATE_TAG)}</TableCell>
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
                  {u.role === 'admin' ? 'Make regular user' : 'Make admin'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

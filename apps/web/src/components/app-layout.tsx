import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

import { NavBar } from '@/components/nav-bar'

const route = getRouteApi('/app')

export function AppLayout() {
  const { user } = route.useRouteContext()
  useChangeStream()
  return (
    <div className="flex flex-1 flex-col">
      <NavBar user={{ email: user.email, image: user.image ?? null }} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

// The server announces changes made by the worker (a swap, a sync, a login
// step); refetch what the page shows when one arrives.
function useChangeStream() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const events = new EventSource('/api/events')
    events.addEventListener('changed', () => void queryClient.invalidateQueries())
    return () => events.close()
  }, [queryClient])
}

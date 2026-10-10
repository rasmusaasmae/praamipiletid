import { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'

import { AppLayout } from '@/components/app-layout'
import { Home } from '@/components/home'
import { praamidLoginQuery, ticketsQuery } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { AddOptionPage } from '@/pages/add-option'
import { SignInPage } from '@/pages/sign-in'

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
})

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  beforeLoad: async () => {
    const { data } = await authClient.getSession()
    if (data) throw redirect({ to: '/' })
  },
  component: SignInPage,
})

// Everything below requires a signed-in user.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async () => {
    const { data } = await authClient.getSession()
    if (!data) throw redirect({ to: '/sign-in' })
    return { user: data.user }
  },
  component: AppLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(ticketsQuery),
      context.queryClient.ensureQueryData(praamidLoginQuery),
    ]),
  component: Home,
})

export const addOptionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/tickets/$ticketId/options',
  params: {
    parse: ({ ticketId }) => ({ ticketId: z.coerce.number().int().positive().parse(ticketId) }),
    stringify: ({ ticketId }) => ({ ticketId: String(ticketId) }),
  },
  validateSearch: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ticketsQuery),
  component: AddOptionPage,
})

const routeTree = rootRoute.addChildren([
  signInRoute,
  appRoute.addChildren([homeRoute, addOptionRoute]),
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}

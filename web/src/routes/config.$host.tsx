import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/config/$host')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/dugdales/$host', params: { host: params.host }, replace: true })
  },
})

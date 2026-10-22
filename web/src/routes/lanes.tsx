import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/lanes')({
  beforeLoad: () => {
    throw redirect({ to: '/dugdales', replace: true })
  },
})

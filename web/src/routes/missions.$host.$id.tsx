import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMission } from '@/hooks/useMission'
import { RunDetail, BackLink } from '@/components/RunDetail'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/missions/$host/$id')({ component: MissionDetail })

function MissionDetail() {
  const { host, id } = Route.useParams()
  const navigate = useNavigate()
  const { data: m, isLoading, isError, error, refetch } = useMission(host, id)
  const back = <BackLink to="/missions" label="Missions" />

  if (isError) {
    return (
      <div className="pt-3">
        <div className="px-5">{back}</div>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }
  if (isLoading || !m) {
    return (
      <div className="space-y-3 px-5 pt-3">
        {back}
        <Skeleton className="h-8 w-80 rounded" />
        <Skeleton className="h-4 w-[32rem] rounded" />
        <Skeleton className="h-64 rounded" />
      </div>
    )
  }
  return (
    <RunDetail
      key={`${host}/${id}`}
      m={m}
      back={back}
      onRestarted={(newId) => void navigate({ to: '/missions/$host/$id', params: { host, id: newId } })}
    />
  )
}

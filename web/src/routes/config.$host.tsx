import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useConfig } from '@/hooks/useConfig'
import { PageHeader } from '@/components/PageHeader'
import { BackButton } from '@/components/BackButton'
import { ErrorState } from '@/components/ErrorState'
import { JsonView } from '@/components/JsonView'
import { HostChip } from '@/components/HostChip'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/config/$host')({ component: Config })

function Config() {
  const { host } = Route.useParams()
  const { data, isLoading, isError, error, refetch } = useConfig(host)
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Config">
        <HostChip host={host} />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
            toast.success('Config copied')
          }}
          disabled={!data}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Copy className="size-3.5" />
          Copy
        </button>
        <BackButton
          fallback={
            <Link
              to="/dugdales"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Dugdales
            </Link>
          }
        />
      </PageHeader>
      <div className="flex-1 overflow-auto p-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-72 rounded-md" />
        ) : (
          <JsonView json={data} />
        )}
      </div>
    </div>
  )
}

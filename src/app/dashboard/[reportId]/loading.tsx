import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

// Shown while a public report page is being fetched on the server. It mirrors the loaded page
// (header, three facts, summary and timeline) so the content settles in without a jump.
export default function PublicReportLoading() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-8 text-ink sm:py-10 lg:px-8">
      <SkeletonGroup className="mx-auto max-w-5xl" label="Loading this report">
        <Skeleton className="h-5 w-48" />
        <section className="mt-7 rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-3/4 max-w-md" />
              <Skeleton className="h-4 w-2/3 max-w-sm" />
            </div>
            <div className="flex gap-2"><Skeleton className="h-6 w-24 rounded-full" /><Skeleton className="h-6 w-28 rounded-full" /></div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((item) => <div className="space-y-3 rounded-2xl border border-line bg-[#fbfdfc] p-4" key={item}><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-36" /></div>)}
          </div>
        </section>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <Card className="rounded-3xl">
            <CardContent className="space-y-5 p-6 sm:p-7">
              <Skeleton className="h-3 w-32" />
              {[0, 1, 2, 3].map((item) => <div className="space-y-2" key={item}><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-full" /></div>)}
            </CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardContent className="space-y-5 p-6 sm:p-7">
              <Skeleton className="h-3 w-28" />
              {[0, 1].map((item) => <div className="space-y-2 border-l-2 border-brand-soft pl-4" key={item}><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-28" /></div>)}
            </CardContent>
          </Card>
        </div>
      </SkeletonGroup>
    </main>
  );
}

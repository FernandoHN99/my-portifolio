export default function Loading() {
  return (
    <main className="min-h-[100dvh] bg-background" aria-label="Carregando visão geral">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1600px] lg:grid-cols-[240px_1fr]">
        <div className="hidden border-r border-sidebar-border bg-sidebar lg:block" />
        <div className="px-5 py-7 sm:px-8 sm:py-10 xl:px-12">
          <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
          <div className="mt-4 h-12 max-w-xl animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-5 max-w-2xl animate-pulse rounded-md bg-muted" />
          <div className="mt-10 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
            <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
            <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
          </div>
        </div>
      </div>
    </main>
  );
}

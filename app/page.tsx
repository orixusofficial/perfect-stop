import Game from "@/components/Game";

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--ps-bg)] font-sans text-[var(--ps-ink)]">
      <div
        aria-hidden
        className="ps-bg-blob a pointer-events-none"
      />
      <div
        aria-hidden
        className="ps-bg-blob b pointer-events-none"
      />
      <div
        aria-hidden
        className="ps-bg-blob c pointer-events-none"
      />
      <div aria-hidden className="ps-vignette pointer-events-none fixed inset-0 z-0" />

      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-5 pt-6 sm:px-8">
        <span className="ps-chip">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ps-card-faint)]">
            reflex arcade
          </span>
        </span>
        <span className="hidden text-sm font-medium text-[var(--ps-ink-soft)] sm:block">
          tap · click · space to stop
        </span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pt-6 pb-10 sm:px-8 sm:pt-10">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="animate-ps-pop text-4xl leading-none font-bold tracking-tight text-[var(--ps-ink)] sm:text-6xl">
            Perfect <span className="text-[var(--ps-accent)]">Stop</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--ps-ink-soft)]">
            Stop the moving indicator inside the zone. Every round gets faster —
            one miss ends the run.
          </p>
        </div>

        <Game />
      </main>
    </div>
  );
}

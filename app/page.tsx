import Game from "@/components/Game";

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--ps-bg)] font-sans text-[var(--ps-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-[var(--ps-blob-a)] blur-3xl animate-ps-float"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-[var(--ps-blob-b)] blur-3xl animate-ps-float [animation-delay:1.6s]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-36 left-1/4 h-72 w-72 rounded-full bg-[var(--ps-blob-c)] blur-3xl animate-ps-float [animation-delay:3.1s]"
      />
      <div aria-hidden className="ps-vignette pointer-events-none fixed inset-0 z-0" />

      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-5 pt-6 sm:px-8">
        <span className="ps-chip">🎯 Reflex Arcade</span>
        <span className="hidden text-sm font-medium text-[var(--ps-ink-soft)] sm:block">
          tap · click · space to stop
        </span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pt-6 pb-10 sm:px-8 sm:pt-10">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="animate-ps-pop text-4xl leading-none font-bold tracking-tight text-[var(--ps-ink)] sm:text-6xl">
            Perfect <span className="text-[var(--ps-accent)]">Stop</span>
          </h1>
        </div>

        <Game />
      </main>
    </div>
  );
}

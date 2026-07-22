"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-6 antialiased">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-destructive mb-6">
          FATAL
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-center">
          Application crashed
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
          {error.message || "A fatal error occurred. Reload the page to try again."}
        </p>
        <button
          onClick={reset}
          className="mt-8 px-6 py-3 border border-border text-sm font-mono uppercase tracking-[0.2em] hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Reload
        </button>
      </body>
    </html>
  );
}

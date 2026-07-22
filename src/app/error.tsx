"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-destructive mb-6">
        SYSTEM_FAULT
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-center">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred. The system has been notified."}
      </p>
      <button
        onClick={reset}
        className="mt-8 px-6 py-3 border border-border text-sm font-mono uppercase tracking-[0.2em] hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

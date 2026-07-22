"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.push("/");
  }, [status, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: displayName || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not create account");

        const result = await signIn("credentials", { email, password, redirect: false });
        if (result?.error) throw new Error("Account created — sign in failed, try again");
        toast.success("Welcome to Forge 2.");
        router.push("/");
      } else {
        const result = await signIn("credentials", { email, password, redirect: false });
        if (result?.error) throw new Error("Invalid email or password");
        toast.success("Welcome back.");
        router.push("/");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    await signIn("google", { callbackUrl: "/" });
    // Browser redirects to Google; execution stops here on success.
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md border-2 border-foreground bg-card p-8 stamp">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-primary mb-2">
          {mode === "signin" ? "Access · Returning Operator" : "Access · New Operator"}
        </div>
        <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Forge 2 · plan, review, ship
        </p>

        <Button
          type="button"
          variant="outline"
          onClick={google}
          disabled={busy}
          className="mt-6 w-full"
        >
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {mode === "signin" ? "Sign in →" : "Create account →"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>

        <Link href="/" className="mt-3 block text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground">
          ← back
        </Link>
      </div>
    </div>
  );
}

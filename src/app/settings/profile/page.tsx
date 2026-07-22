"use client";

import { useSession } from "next-auth/react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail } from "lucide-react";

export default function ProfilePage() {
  const { data: session } = useSession();

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ ACCOUNT · PROFILE"
        title="Profile"
        subtitle="Your account details across all workspaces."
      />
      <Card className="max-w-lg border-border/50 bg-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                <User className="h-5 w-5" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">{session?.user?.name ?? "—"}</CardTitle>
              <p className="text-xs text-muted-foreground">Account</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4" />
            {session?.user?.email ?? "—"}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

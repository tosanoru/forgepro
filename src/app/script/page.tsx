"use client";

import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function ScriptLandingPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 03 · SCRIPT"
        title="Scripts"
        subtitle="Write a script from scratch — no AI generation."
        action={
          <Link href="/script/write">
            <Button>
              <FileText className="h-4 w-4" /> Write script
            </Button>
          </Link>
        }
      />
    </AppShell>
  );
}

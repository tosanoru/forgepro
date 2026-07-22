"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useVideos } from "@/lib/use-videos";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, Video as VideoIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; tone: string }> = {
  uploading: { label: "Uploading", tone: "bg-muted text-muted-foreground" },
  processing: { label: "Processing", tone: "bg-amber-stat/15 text-amber-stat" },
  ready: { label: "Ready", tone: "bg-emerald-stat/15 text-emerald-stat" },
  errored: { label: "Error", tone: "bg-rose-stat/15 text-rose-stat" },
};

const REVIEW_META: Record<string, { label: string; tone: string }> = {
  pending_review: { label: "Pending review", tone: "bg-muted text-muted-foreground" },
  changes_requested: { label: "Changes requested", tone: "bg-rose-stat/15 text-rose-stat" },
  approved: { label: "Approved", tone: "bg-emerald-stat/15 text-emerald-stat" },
};

export default function VideosPage() {
  const { videos, loading, upload } = useVideos();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      await upload(file, file.name.replace(/\.[^/.]+$/, ""), setProgress);
      toast.success("Uploaded — processing on Mux now, this page updates automatically");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 04 · VIDEO REVIEW"
        title="Videos"
        subtitle="Upload, comment at a timestamp, share a review link with a client."
        action={
          <>
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress}%
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload video
                </>
              )}
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading videos…
        </div>
      ) : videos.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <VideoIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No videos yet. Upload one to start a review.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const status = STATUS_META[v.status];
            const review = REVIEW_META[v.reviewStatus];
            return (
              <Link key={v.id} href={`/videos/${v.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="line-clamp-2 text-base">{v.title}</CardTitle>
                    <CardDescription>
                      {v.durationSeconds ? `${Math.floor(v.durationSeconds / 60)}:${String(v.durationSeconds % 60).padStart(2, "0")}` : "—"}
                    </CardDescription>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.tone}`}>{status.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${review.tone}`}>{review.label}</span>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

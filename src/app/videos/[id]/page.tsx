"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import MuxPlayer from "@mux/mux-player-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useVideo, useVideoComments, useApprovalLinks } from "@/lib/use-videos";
import { useContentCards } from "@/lib/use-content";
import { AttachCardPicker } from "@/components/AttachCardPicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, MessageSquarePlus, Link2, Copy, Check, CheckCircle2, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const { video, loading } = useVideo(params.id);
  const { comments, addComment, toggleResolved } = useVideoComments(params.id);
  const { links, createLink, setRevoked } = useApprovalLinks(params.id);
  const { cards, attachResource } = useContentCards();
  const playerRef = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const handleTimeUpdate = () => {
    setCurrentTime(playerRef.current?.currentTime ?? 0);
  };

  const seekTo = (t: number) => {
    if (playerRef.current) playerRef.current.currentTime = t;
  };

  const submitComment = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await addComment(currentTime, draft.trim());
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setPosting(false);
    }
  };

  const shareLink = async () => {
    setCreatingLink(true);
    try {
      const link = await createLink(video?.title);
      if (link) {
        const url = `${window.location.origin}/approve/${link.token}`;
        await navigator.clipboard.writeText(url);
        setCopiedToken(link.token);
        toast.success("Review link copied to clipboard");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create review link");
    } finally {
      setCreatingLink(false);
    }
  };

  if (loading || !video) {
    return (
      <AppShell>
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading video…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 04 · VIDEO"
        title={video.title}
        subtitle={video.status === "ready" ? "Ready for review" : `${video.status} — this page updates automatically`}
        action={
          <Button onClick={shareLink} disabled={creatingLink || video.status !== "ready"} variant="outline">
            {copiedToken ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            {creatingLink ? "Creating…" : "Share for review"}
          </Button>
        }
      />

      <div className="mb-4 max-w-xs">
        <AttachCardPicker
          currentCardId={cards.find((c) => c.videoId === video.id)?.id ?? null}
          onAttach={async (cardId) => {
            try {
              await attachResource("videoId", video.id, cardId);
              toast.success(cardId ? "Attached to content card" : "Detached from content card");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to update");
            }
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {video.status === "ready" && video.muxPlaybackId ? (
            <MuxPlayer
              ref={playerRef as never}
              playbackId={video.muxPlaybackId}
              streamType="on-demand"
              className="w-full aspect-video overflow-hidden rounded"
              onTimeUpdate={handleTimeUpdate}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
              {video.status === "errored" ? "Mux failed to process this video." : "Still processing on Mux…"}
            </div>
          )}

          {links.length > 0 && (
            <div className="border border-border bg-card p-3 text-xs">
              <div className="mb-1.5 font-mono uppercase tracking-[0.2em] text-muted-foreground">Review links</div>
              {links.map((l) => {
                const expired = l.expiresAt ? new Date(l.expiresAt) < new Date() : false;
                const inactive = l.revoked || expired;
                return (
                  <div key={l.id} className="flex items-center justify-between gap-2 py-1">
                    <button
                      onClick={() => {
                        if (inactive) return;
                        navigator.clipboard.writeText(`${window.location.origin}/approve/${l.token}`);
                        setCopiedToken(l.token);
                        toast.success("Copied");
                      }}
                      disabled={inactive}
                      className={`flex flex-1 items-center gap-1.5 truncate text-left ${inactive ? "text-muted-foreground line-through" : "hover:text-primary"}`}
                    >
                      <span className="truncate">{l.label}</span>
                      {l.revoked && <span className="shrink-0 font-mono normal-case">(revoked)</span>}
                      {!l.revoked && expired && <span className="shrink-0 font-mono normal-case">(expired)</span>}
                    </button>
                    {!inactive && (copiedToken === l.token ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />)}
                    <button
                      title={l.revoked ? "Reactivate this link" : "Revoke this link"}
                      onClick={async () => {
                        try {
                          await setRevoked(l.id, !l.revoked);
                          toast.success(l.revoked ? "Link reactivated" : "Link revoked");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to update link");
                        }
                      }}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      {l.revoked ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Comments</CardTitle>
            <CardDescription>Click a timestamp to jump the player there.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className={`border-b border-border pb-3 last:border-0 last:pb-0 ${c.resolved ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button onClick={() => seekTo(c.timestampSeconds)} className="font-mono font-semibold text-primary hover:underline">
                          {formatTime(c.timestampSeconds)}
                        </button>
                        <span className="text-muted-foreground">{c.guestName ?? "Team"}</span>
                      </div>
                      <button
                        onClick={() => toggleResolved(c.id, !c.resolved)}
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                          c.resolved ? "bg-emerald-stat/15 text-emerald-stat" : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" /> {c.resolved ? "Resolved" : "Mark resolved"}
                      </button>
                    </div>
                    <p className={`mt-1 text-sm ${c.resolved ? "line-through" : ""}`}>{c.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <Textarea
                placeholder={`Comment at ${formatTime(currentTime)}…`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />
              <Button onClick={submitComment} disabled={posting || !draft.trim()} size="sm" className="w-full">
                <MessageSquarePlus className="h-4 w-4" /> Comment at {formatTime(currentTime)}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

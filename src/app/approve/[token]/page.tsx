"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import MuxPlayer from "@mux/mux-player-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ThumbsUp, MessageCircleWarning, Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const json = await r.json();
  if (!r.ok) throw new Error(json.error ?? "Failed to load");
  return json;
});

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * This is the actual "Client Approval" surface — what an agency's client
 * sees when they click a review link. No sidebar, no workspace switcher,
 * no team info: just the video(s) this token was scoped to, the comment
 * thread, and Approve / Request Changes. Guest name is asked for once and
 * kept in component state only — no account, no cookie, nothing persisted
 * beyond this session (see videoComments.guestName in schema.ts).
 */
export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const { data, error, isLoading } = useSWR(`/api/approval/${token}`, fetcher);
  const [guestName, setGuestName] = useState("");
  const playerRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const video = data?.videos?.[0];

  const { data: commentsData, mutate: mutateComments } = useSWR(
    video ? `/api/approval/${token}/comments?videoId=${video.id}` : null,
    fetcher,
  );

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const seekTo = (t: number) => {
    if (playerRef.current) playerRef.current.currentTime = t;
  };

  const handleTimeUpdate = () => {
    setCurrentTime(playerRef.current?.currentTime ?? 0);
  };

  const submitComment = async () => {
    if (!draft.trim() || !video) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/approval/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, timestampSeconds: currentTime, content: draft.trim(), guestName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDraft("");
      await mutateComments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const decide = async (reviewStatus: "approved" | "changes_requested") => {
    if (!video) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/approval/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, reviewStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(reviewStatus === "approved" ? "Approved — thank you!" : "Changes requested — the team's been notified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setDeciding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "This review link isn't available."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <Toaster />
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {data.workspace.name} · Video review
        </div>
        <h1 className="mb-6 font-display text-2xl font-bold">{video?.title ?? data.label}</h1>

        {video?.muxPlaybackId ? (
          <MuxPlayer
            ref={playerRef as never}
            playbackId={video.muxPlaybackId}
            streamType="on-demand"
            className="w-full aspect-video overflow-hidden rounded"
            onTimeUpdate={handleTimeUpdate}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
            Still processing — check back shortly.
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => decide("approved")} disabled={deciding} className="flex-1 min-w-40">
            <ThumbsUp className="h-4 w-4" /> Approve
          </Button>
          <Button onClick={() => decide("changes_requested")} disabled={deciding} variant="outline" className="flex-1 min-w-40">
            <MessageCircleWarning className="h-4 w-4" /> Request changes
          </Button>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">Comments</h2>

          <div className="mb-4 space-y-3">
            {(commentsData?.comments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No comments yet — be the first.</p>
            ) : (
              commentsData.comments.map((c: { id: string; timestampSeconds: number; content: string; guestName: string | null }) => (
                <div key={c.id} className="border-b border-border pb-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs">
                    <button onClick={() => seekTo(c.timestampSeconds)} className="font-mono font-semibold text-primary hover:underline">
                      {formatTime(c.timestampSeconds)}
                    </button>
                    <span className="text-muted-foreground">{c.guestName ?? "Client"}</span>
                  </div>
                  <p className="mt-1 text-sm">{c.content}</p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            {!guestName && (
              <Input placeholder="Your name (shown with your comments)" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            )}
            <Textarea
              placeholder={`Comment at ${formatTime(currentTime)}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
            />
            <Button onClick={submitComment} disabled={posting || !draft.trim()} size="sm">
              <MessageSquarePlus className="h-4 w-4" /> Comment at {formatTime(currentTime)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

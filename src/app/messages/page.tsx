"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { MentionTextarea } from "@/components/MentionTextarea";
import { useWorkspace } from "@/lib/use-workspace";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Search,
  Loader2,
  Plus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

type Participant = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  lastReadAt: string | null;
};

type Conversation = {
  id: string;
  subject: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  participants: Participant[];
};

function initials(name: string | null, email: string) {
  const base = name?.trim() || email;
  return base.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export default function MessagesPage() {
  const { workspace, members, role } = useWorkspace();
  const { user } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const canCreate = role === "owner" || role === "admin" || role === "editor";

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messaging/conversations");
      if (res.ok) {
        setConversations(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.subject?.toLowerCase().includes(q) ||
      c.lastMessagePreview.toLowerCase().includes(q) ||
      c.participants.some(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q),
      )
    );
  });

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (participantIds.length === 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/messaging/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds,
          subject: subject || undefined,
          content: content || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const { id } = await res.json();
      toast.success("Conversation started");
      setNewOpen(false);
      setParticipantIds([]);
      setSubject("");
      setContent("");
      router.push(`/messages/${id}`);
    } catch {
      toast.error("Failed to create conversation");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 03 · MESSAGES"
        title="Messages"
        subtitle="Team conversations across this workspace."
      />

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canCreate && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border py-16 text-center">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search
                ? "No conversations match your search."
                : "No conversations yet."}
            </p>
          </div>
        ) : (
          <div className="border border-border bg-card">
            <ul className="divide-y divide-border">
              {filtered.map((c) => {
                const others = c.participants.filter(
                  (p) => p.userId !== user?.id,
                );
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages/${c.id}`}
                      className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-xs font-bold text-muted-foreground">
                        {others[0]?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={others[0].image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials(
                            others[0]?.name ?? null,
                            others[0]?.email ?? "",
                          )
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">
                            {c.subject ||
                              others.map((p) => p.name || p.email).join(", ") ||
                              "New conversation"}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {timeAgo(c.lastMessageAt)}
                          </span>
                        </div>
                        {others.length > 0 && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {others.map((p) => p.name || p.email).join(", ")}
                          </div>
                        )}
                        {c.lastMessagePreview && (
                          <p className="mt-1 truncate text-xs text-muted-foreground/70">
                            {c.lastMessagePreview}
                          </p>
                        )}
                      </div>
                      {c.unreadCount > 0 && (
                        <span className="mt-1 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-bold text-primary-foreground">
                          {c.unreadCount}
                        </span>
                      )}
                      <ArrowRight className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Start a workspace conversation. You&apos;re automatically included.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleNewConversation} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Participants</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={participantIds.includes(m.id)}
                      onChange={() => toggleParticipant(m.id)}
                      className="accent-primary"
                    />
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-[9px] font-bold text-muted-foreground">
                      {m.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(m.name, m.email)
                      )}
                    </div>
                    <span className="truncate text-sm">
                      {m.name || m.email}
                    </span>
                    {m.name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conv-subject">Subject (optional)</Label>
              <Input
                id="conv-subject"
                placeholder="What's this about?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conv-message">First message (optional)</Label>
              <MentionTextarea
                placeholder="Type a message to get things started…"
                rows={3}
                value={content}
                onChange={setContent}
                items={members.map(m => ({ id: m.id, name: m.name, email: m.email, image: m.image }))}
                onMention={(user) => {
                  if (!participantIds.includes(user.id)) {
                    setParticipantIds((prev) => [...prev, user.id]);
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={participantIds.length === 0 || sending}
              >
                {sending ? "Creating…" : "Start conversation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

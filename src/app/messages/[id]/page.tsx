"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { MentionTextarea } from "@/components/MentionTextarea";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Send,
} from "lucide-react";
import { toast } from "sonner";

type Sender = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type Participant = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  lastReadAt: string | null;
};

type Message = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender: Sender;
};

type ConversationDetail = {
  id: string;
  subject: string | null;
  participants: Participant[];
  messages: Message[];
};

function initials(name: string | null, email: string) {
  const base = name?.trim() || email;
  return base.slice(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderContent(text: string, mentions: Participant[]) {
  const parts: { t: "text" | "mention"; v: string }[] = [];
  let last = 0;
  const re = /@(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    parts.push({ t: "mention", v: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });
  return parts.map((p, i) =>
    p.t === "mention" ? (
      <span key={i} className="rounded bg-primary/10 px-0.5 font-semibold text-primary">
        {p.v}
      </span>
    ) : (
      <span key={i}>{p.v}</span>
    ),
  );
}

export default function ThreadPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/messaging/conversations/${id}`);
      if (res.status === 404) {
        router.push("/messages");
        return;
      }
      if (res.ok) {
        setConv(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading, conv?.messages.length]);

  useEffect(() => {
    if (!conv) return;
    fetch(`/api/messaging/conversations/${id}/read`, { method: "PATCH" }).catch(
      () => {},
    );
  }, [conv, id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messaging/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body }),
      });
      if (!res.ok) throw new Error("Failed");
      setReply("");
      await fetchThread();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const senderAvatar = (s: Sender) => (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-[10px] font-bold text-muted-foreground">
      {s.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(s.name, s.email)
      )}
    </div>
  );

  const others = conv?.participants.filter((p) => p.userId !== user?.id) ?? [];

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
        </Link>
      </div>

      <PageHeader
        eyebrow="№ 03 · MESSAGES"
        title={
          conv?.subject ||
          others.map((p) => p.name || p.email).join(", ") ||
          "Conversation"
        }
        subtitle={others.map((p) => p.name || p.email).join(", ")}
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading thread…
        </div>
      ) : !conv ? null : (
        <div className="flex flex-col border border-border bg-card" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
          <div className="flex-1 space-y-1 overflow-y-auto p-5">
            {conv.messages.map((m) => {
              const isMe = m.senderId === user?.id;
              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-2 ${isMe ? "justify-end" : "justify-start"}`}
                >
                  {!isMe && (
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-[8px] font-bold text-muted-foreground">
                      {m.sender.image ? (
                        <img src={m.sender.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(m.sender.name, m.sender.email)
                      )}
                    </div>
                  )}
                  <div className="max-w-[70%]">
                    {!isMe && (
                      <div className="mb-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                        {m.sender.name || m.sender.email}
                      </div>
                    )}
                    <div
                      className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        isMe
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted"
                      }`}
                    >
                      {renderContent(m.content, conv.participants)}
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/60">
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                  {isMe && (
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-[8px] font-bold text-muted-foreground">
                      {m.sender.image ? (
                        <img src={m.sender.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(m.sender.name, m.sender.email)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {conv.messages.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No messages yet. Say something to get started.
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border">
            <form onSubmit={handleSend}>
              <div className="relative">
                <MentionTextarea
                  placeholder="Type a message…"
                  rows={1}
                  className="min-h-[42px] w-full resize-none rounded-none border-0 px-5 py-3 pr-12 shadow-none focus-visible:ring-0"
                  minHeight="42px"
                  value={reply}
                  onChange={setReply}
                  items={conv.participants.map((p) => ({
                    id: p.userId,
                    name: p.name,
                    email: p.email,
                    image: p.image,
                  }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!reply.trim() || sending}
                  className="absolute bottom-1.5 right-2 h-7 w-7"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

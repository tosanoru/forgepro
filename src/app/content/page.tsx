"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useContentCards } from "@/lib/use-content";
import { ContentCalendarView } from "@/components/ContentCalendarView";
import { CONTENT_STAGES, CONTENT_STAGE_LABELS, daysUntil, type ContentCard, type ContentStage } from "@/lib/content-types";
import { STAGE_META } from "@/lib/content-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Loader2, CalendarClock, AlertTriangle, Trash2, User as UserIcon, FileText, Video as VideoIcon, Sparkles, LayoutGrid, CalendarDays } from "lucide-react";
import { toast } from "sonner";

function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null;
  const days = daysUntil(dueDate);
  const overdue = days < 0;
  const soon = days >= 0 && days <= 2;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        overdue ? "bg-rose-stat/15 text-rose-stat" : soon ? "bg-amber-stat/15 text-amber-stat" : "bg-muted text-muted-foreground"
      }`}
    >
      {overdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <CalendarClock className="h-2.5 w-2.5" />}
      {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
    </span>
  );
}

function CardTile({ card, onDragStart, onOpen }: { card: ContentCard; onDragStart: (e: React.DragEvent, id: string) => void; onOpen: (id: string) => void }) {
  return (
    <button
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onClick={() => onOpen(card.id)}
      className="w-full cursor-grab rounded border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug">{card.name}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
          {card.format}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DueBadge dueDate={card.dueDate} />
        {card.assignee && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            <UserIcon className="h-2.5 w-2.5" /> {card.assignee.name || card.assignee.email.split("@")[0]}
          </span>
        )}
      </div>
    </button>
  );
}

export default function ContentPlanningPage() {
  const { cards, loading, createCard, moveStage, updateCard, deleteCard } = useContentCards();
  const [view, setView] = useState<"board" | "calendar">("board");
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ContentStage | null>(null);

  const [name, setName] = useState("");
  const [format, setFormat] = useState<"short" | "long">("short");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  const detailCard = cards.find((c) => c.id === detailId) ?? null;

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (e: React.DragEvent, stage: ContentStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    const card = cards.find((c) => c.id === id);
    if (card && card.stage !== stage) moveStage(id, stage);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createCard({ name: name.trim(), format, notes: notes.trim() || undefined, dueDate: dueDate || undefined });
      setName("");
      setNotes("");
      setDueDate("");
      setNewOpen(false);
      toast.success("Added to the board");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 05 · CONTENT PLANNING"
        title={view === "board" ? "Board" : "Calendar"}
        subtitle={view === "board" ? "Drag a card between stages as work moves forward." : "Cards with a due date, laid out by month."}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-border p-0.5">
              <button
                onClick={() => setView("board")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Board
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Calendar
              </button>
            </div>
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New card
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading board…
        </div>
      ) : view === "calendar" ? (
        <ContentCalendarView cards={cards} onOpenCard={setDetailId} />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {CONTENT_STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const Icon = meta.icon;
            const stageCards = cards.filter((c) => c.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => onDrop(e, stage)}
                className={`flex w-72 shrink-0 flex-col rounded border-2 border-dashed p-2 transition-colors ${
                  dragOverStage === stage ? "border-primary bg-primary/5" : meta.columnTone
                }`}
              >
                <div className={`mb-2 flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${meta.chipTone}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {CONTENT_STAGE_LABELS[stage]}
                  <span className="ml-auto font-mono text-[10px] opacity-70">{stageCards.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 min-h-24">
                  {stageCards.map((card) => (
                    <CardTile key={card.id} card={card} onDragStart={onDragStart} onOpen={setDetailId} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New card dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New content idea</DialogTitle>
            <DialogDescription>Starts in Idea — move it forward as it develops.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNew} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="card-name">Title</Label>
              <Input id="card-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Why nobody talks about..." />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as "short" | "long")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="long">Long-form</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-notes">Notes</Label>
              <Textarea id="card-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brief, talking points, reference links…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-due">Due date (optional)</Label>
              <Input id="card-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <Button type="submit" disabled={creating} className="w-full">
              {creating ? "Adding…" : "Add to board"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Card detail dialog */}
      <Dialog open={!!detailCard} onOpenChange={(open) => !open && setDetailId(null)}>
        {detailCard && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{detailCard.name}</DialogTitle>
              <DialogDescription>{CONTENT_STAGE_LABELS[detailCard.stage]} · {detailCard.format}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="detail-notes">Notes</Label>
                <Textarea
                  id="detail-notes"
                  rows={5}
                  defaultValue={detailCard.notes}
                  onBlur={(e) => {
                    if (e.target.value !== detailCard.notes) updateCard(detailCard.id, { notes: e.target.value });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="detail-due">Due date</Label>
                <Input
                  id="detail-due"
                  type="date"
                  defaultValue={detailCard.dueDate ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (detailCard.dueDate ?? "")) updateCard(detailCard.id, { dueDate: e.target.value || null });
                  }}
                />
              </div>

              {(detailCard.scriptId || detailCard.videoId) && (
                <div className="flex gap-2">
                  {detailCard.scriptId && (
                    <Link href={`/script/${detailCard.scriptId}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <FileText className="h-3.5 w-3.5" /> View script
                      </Button>
                    </Link>
                  )}
                  {detailCard.videoId && (
                    <Link href={`/videos/${detailCard.videoId}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <VideoIcon className="h-3.5 w-3.5" /> View video
                      </Button>
                    </Link>
                  )}
                </div>
              )}

              {!detailCard.scriptId && (
                <Link
                  href={`/script/new?cardId=${detailCard.id}&format=${detailCard.format}&topic=${encodeURIComponent(
                    `${detailCard.name}${detailCard.notes ? ` — ${detailCard.notes}` : ""}`,
                  )}`}
                >
                  <Button variant="outline" size="sm" className="w-full">
                    <Sparkles className="h-3.5 w-3.5" /> Generate {detailCard.format === "short" ? "short-form" : "long-form"} script
                  </Button>
                </Link>
              )}

              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await deleteCard(detailCard.id);
                    setDetailId(null);
                    toast.success("Removed from board");
                  } catch {
                    setDetailId(null);
                    toast("Card was already removed");
                  }
                }}
                className="w-full text-rose-stat hover:text-rose-stat"
              >
                <Trash2 className="h-4 w-4" /> Remove card
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}

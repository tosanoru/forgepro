"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentCard } from "@/lib/content-types";
import { STAGE_META } from "@/lib/content-meta";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The calendar half of "Notion-style content planning" — the board
 * existed, this didn't. Deliberately reuses `dueDate` (already on every
 * card since the very first Content Planning pass) rather than adding a
 * separate scheduling concept; a card's due date IS its calendar
 * position, there's no second date field to keep in sync.
 */
export function ContentCalendarView({ cards, onOpenCard }: { cards: ContentCard[]; onOpenCard: (id: string) => void }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cardsByDate = useMemo(() => {
    const map = new Map<string, ContentCard[]>();
    for (const card of cards) {
      if (!card.dueDate) continue;
      const list = map.get(card.dueDate) ?? [];
      list.push(card);
      map.set(card.dueDate, list);
    }
    return map;
  }, [cards]);

  const weeks = useMemo(() => {
    const firstOfMonth = monthCursor;
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - startOffset);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }

    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [monthCursor]);

  const today = toDateKey(new Date());
  const monthLabel = monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{monthLabel}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMonthCursor(new Date())}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Today
          </button>
          <button
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-l border-border">
        {WEEKDAYS.map((day) => (
          <div key={day} className="border-b border-r border-border bg-muted/30 px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {day}
          </div>
        ))}
        {weeks.map((week, wi) =>
          week.map((day, di) => {
            const key = toDateKey(day);
            const inMonth = day.getMonth() === monthCursor.getMonth();
            const dayCards = cardsByDate.get(key) ?? [];
            return (
              <div
                key={`${wi}-${di}`}
                className={`min-h-24 border-b border-r border-border p-1.5 ${inMonth ? "" : "bg-muted/10"} ${key === today ? "bg-primary/5" : ""}`}
              >
                <div className={`mb-1 font-mono text-[10px] ${inMonth ? "text-muted-foreground" : "text-muted-foreground/40"} ${key === today ? "font-bold text-primary" : ""}`}>
                  {day.getDate()}
                </div>
                <div className="space-y-1">
                  {dayCards.slice(0, 3).map((card) => {
                    const meta = STAGE_META[card.stage];
                    return (
                      <button
                        key={card.id}
                        onClick={() => onOpenCard(card.id)}
                        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${meta.chipTone}`}
                        title={card.name}
                      >
                        {card.name}
                      </button>
                    );
                  })}
                  {dayCards.length > 3 && (
                    <div className="px-1.5 text-[9px] text-muted-foreground">+{dayCards.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

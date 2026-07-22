"use client";

import { useContentCards } from "@/lib/use-content";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutGrid } from "lucide-react";

const UNATTACHED = "__unattached__";

/**
 * Reusable across Script, Video, and Thumbnail detail pages — closes the
 * gap noted in CLAUDE.md where scriptId/videoId/contentCardId existed in
 * the schema since Content Planning was built but nothing in the UI ever
 * set them. One component instead of three near-identical pickers.
 */
export function AttachCardPicker({
  currentCardId,
  onAttach,
  disabled,
}: {
  currentCardId: string | null;
  onAttach: (cardId: string | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { cards } = useContentCards();

  return (
    <div className="flex items-center gap-2">
      <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Select
        value={currentCardId ?? UNATTACHED}
        onValueChange={(v) => onAttach(v === UNATTACHED ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder="Attach to content card" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNATTACHED}>Not attached to a card</SelectItem>
          {cards.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

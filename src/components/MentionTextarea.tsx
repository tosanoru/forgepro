"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export type MentionUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

interface MentionTextareaProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  items: MentionUser[];
  onMention?: (user: MentionUser) => void;
  rows?: number;
  className?: string;
  minHeight?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const LINE_H = 20;
const CHAR_W = 7.8;

function getCaretPosition(el: HTMLTextAreaElement): { top: number; left: number } {
  const pos = el.selectionStart || 0;
  const text = el.value.slice(0, pos);
  const lines = text.split("\n");
  const row = lines.length;
  const col = lines[lines.length - 1].length;
  const scrollTop = el.scrollTop;
  return {
    top: (row - 1) * LINE_H - scrollTop + 24,
    left: Math.min(col * CHAR_W, el.offsetWidth - 220),
  };
}

export function MentionTextarea({
  placeholder,
  value,
  onChange,
  items,
  onMention,
  rows,
  className,
  minHeight,
  onKeyDown,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const filtered = query
    ? items.filter((u) => (u.name || u.email).toLowerCase().includes(query.toLowerCase()))
    : items;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const sel = e.target.selectionStart || 0;
      const before = val.slice(0, sel);
      const m = before.match(/@(\w*)$/);
      if (m) {
        setQuery(m[1]);
        setOpen(true);
        setIndex(0);
        setPos(getCaretPosition(e.target));
      } else {
        setOpen(false);
      }
      onChange(val);
    },
    [onChange],
  );

  const select = useCallback(
    (user: MentionUser) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const sel = ta.selectionStart || 0;
      const before = value.slice(0, sel);
      const after = value.slice(sel);
      const m = before.match(/@(\w*)$/);
      if (!m) return;
      const prefix = before.slice(0, before.length - m[0].length);
      const label = user.name || user.email;
      const insertion = `@${label} `;
      onChange(prefix + insertion + after);
      setOpen(false);
      onMention?.(user);
      requestAnimationFrame(() => {
        const np = prefix.length + insertion.length;
        ta.setSelectionRange(np, np);
        ta.focus();
      });
    },
    [value, onChange, onMention],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open) {
        if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          if (filtered[index]) { e.preventDefault(); select(filtered[index]); return; }
        }
        if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
      }
      onKeyDown?.(e);
    },
    [open, filtered, index, select, onKeyDown],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current && !textareaRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        style={{ minHeight }}
      />
      {open && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 max-h-40 w-56 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {filtered.map((user, idx) => (
            <button
              key={user.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                idx === index ? "bg-muted" : "hover:bg-muted",
              )}
              onMouseDown={(e) => { e.preventDefault(); select(user); }}
              onMouseEnter={() => setIndex(idx)}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-[8px] font-bold text-muted-foreground">
                {user.image ? (
                  <img src={user.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  (user.name || user.email).slice(0, 2).toUpperCase()
                )}
              </div>
              <span className="truncate">{user.name || user.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
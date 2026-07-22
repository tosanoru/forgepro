export interface ViralStyle {
  id: string;
  label: string;
  description: string;
}

export const SHORT_FORM_STYLES: ViralStyle[] = [
  {
    id: "hook-reversal",
    label: "Hook Reversal",
    description: "Start with a common belief, then flip it — the twist keeps viewers watching to see if you're serious.",
  },
  {
    id: "pattern-interrupt",
    label: "Pattern Interrupt",
    description: "Open with something completely unexpected that breaks the scroll. Confusion buys you 3 more seconds.",
  },
  {
    id: "story-time",
    label: "Story Time",
    description: "A tight personal anecdote with a clear payoff. No scene breaks, one continuous take, emotional arc.",
  },
  {
    id: "transformation",
    label: "Transformation",
    description: "Before → after. The gap between where they are and where they could be. High rewatch value.",
  },
  {
    id: "hot-take",
    label: "Hot Take",
    description: "Controversial opinion on a popular topic. Designed to trigger comments and debate in the replies.",
  },
  {
    id: "quick-explainer",
    label: "Quick Explainer",
    description: "Break down something complex in 60 seconds. One concept, one metaphor, one takeaway.",
  },
  {
    id: "comparison",
    label: "Comparison",
    description: "Side-by-side of two things people argue about. Settle the debate with a clear winner.",
  },
  {
    id: "the-loop",
    label: "The Loop",
    description: "Ends where it started. The last line reframes the opening — satisfying rewatch, high completion rate.",
  },
  {
    id: "value-list",
    label: "Value List",
    description: "Rapid-fire tips or hacks. No fluff, no story — just X things delivered fast.",
  },
  {
    id: "challenge-reaction",
    label: "Challenge / Reaction",
    description: "React to or attempt something interesting. Built-in tension from not knowing the outcome.",
  },
];

export const LONG_FORM_STYLES: ViralStyle[] = [
  {
    id: "deep-dive",
    label: "Deep Dive",
    description: "Comprehensive breakdown of a single topic. Leave no stone unturned — the authority play.",
  },
  {
    id: "documentary",
    label: "Documentary",
    description: "Investigative, narrative-driven. Interviews, research, evidence revealed over time. High perceived value.",
  },
  {
    id: "storytelling-arc",
    label: "Storytelling Arc",
    description: "Classic setup → conflict → resolution. Emotional beats, character journey, satisfying conclusion.",
  },
  {
    id: "educational",
    label: "Educational",
    description: "Teach a skill or concept step by step. Clear progression, actionable takeaways, high save rate.",
  },
  {
    id: "review-analysis",
    label: "Review / Analysis",
    description: "Critical examination of a product, creator, or trend. Bring receipts, back every claim.",
  },
  {
    id: "contrarian",
    label: "Contrarian",
    description: "Challenge widely accepted wisdom. Requires strong evidence — weak takes get destroyed in comments.",
  },
  {
    id: "challenge-experiment",
    label: "Challenge / Experiment",
    description: "Document trying something unconventional for Y days. Built-in narrative arc from the calendar.",
  },
  {
    id: "behind-the-scenes",
    label: "Behind the Scenes",
    description: "Show your process. How you work, how you think, how you create — the stuff people don't see.",
  },
  {
    id: "collab-conversation",
    label: "Collab / Conversation",
    description: "Dialogue with another creator or expert. Chemistry matters more than the topic list.",
  },
  {
    id: "list-guide",
    label: "List / Guide",
    description: "Curated collection of things. Top X, ultimate guide, everything you need to know — scannable, bookmarkable.",
  },
];

export function getStyleById(id: string, format: "short" | "long"): ViralStyle | undefined {
  const pool = format === "short" ? SHORT_FORM_STYLES : LONG_FORM_STYLES;
  return pool.find((s) => s.id === id);
}

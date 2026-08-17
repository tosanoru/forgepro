"use client";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Trophy,
  Zap,
  Flame,
  Target,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Star,
  Timer,
  Users,
  Video,
  Sparkles,
  BarChart3,
  TrendingUp,
  Crown,
  Medal,
  Lock,
  Share2,
  Gift,
  Hourglass,
} from "lucide-react";

/* ─── Data ─────────────────────────────────────────── */

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const WEEKLY_PHASES = [
  {
    week: 1,
    label: "Foundation",
    subtitle: "Niche, brand & strategy",
    color: "from-sky-500/20 to-sky-600/10",
    border: "border-sky-500/30",
    accent: "text-sky-400",
  },
  {
    week: 2,
    label: "Creation",
    subtitle: "First videos & consistency",
    color: "from-violet-500/20 to-violet-600/10",
    border: "border-violet-500/30",
    accent: "text-violet-400",
  },
  {
    week: 3,
    label: "Growth",
    subtitle: "Engagement & reach",
    color: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/30",
    accent: "text-amber-400",
  },
  {
    week: 4,
    label: "Scale",
    subtitle: "Optimise & hit 1k",
    color: "from-emerald-500/20 to-emerald-600/10",
    border: "border-emerald-500/30",
    accent: "text-emerald-400",
  },
];

interface Quest {
  id: string;
  day: number;
  week: number;
  title: string;
  desc: string;
  xp: number;
}

const QUESTS: Quest[] = [
  // ── Week 1: Foundation ──
  { id: "w1d1", day: 1, week: 1, title: "Pick your niche", desc: "Define a specific, proven YouTube niche you're excited about.", xp: 50 },
  { id: "w1d2", day: 2, week: 1, title: "Research top 10 channels", desc: "Analyse 10 successful channels in your niche — thumbnails, titles, hooks.", xp: 40 },
  { id: "w1d3", day: 3, week: 1, title: "Define your audience avatar", desc: "Write down exactly who you're making videos for.", xp: 30 },
  { id: "w1d4", day: 4, week: 1, title: "Set up channel branding", desc: "Banner, profile pic, channel description, links.", xp: 40 },
  { id: "w1d5", day: 5, week: 1, title: "Create a content pillar doc", desc: "List 20 video ideas organised into content pillars.", xp: 60 },
  { id: "w1d6", day: 6, week: 1, title: "Study YouTube algorithm basics", desc: "Understand CTR, retention, session time.", xp: 30 },
  { id: "w1d7", day: 7, week: 1, title: "Plan first 7 videos", desc: "Outline your first week of uploads with hooks & thumbnails sketched.", xp: 50 },

  // ── Week 2: Creation ──
  { id: "w2d1", day: 8, week: 2, title: "Film & upload video №1", desc: "Publish your first real video. Good enough > perfect.", xp: 100 },
  { id: "w2d2", day: 9, week: 2, title: "Create a custom thumbnail", desc: "Design a high-CTR thumbnail with face + text overlay.", xp: 50 },
  { id: "w2d3", day: 10, week: 2, title: "Write a retention-focused script", desc: "Script video №2 with a hook in the first 5 seconds.", xp: 60 },
  { id: "w2d4", day: 11, week: 2, title: "Film & upload video №2", desc: "Apply learnings from video 1. Improve one thing.", xp: 100 },
  { id: "w2d5", day: 12, week: 2, title: "Post a YouTube Short", desc: "Repurpose a key moment into a vertical Short.", xp: 40 },
  { id: "w2d6", day: 13, week: 2, title: "Optimise video metadata", desc: "Titles, descriptions, tags, end screens & cards on both videos.", xp: 40 },
  { id: "w2d7", day: 14, week: 2, title: "Upload video №3", desc: "Third video — you're building momentum now.", xp: 100 },

  // ── Week 3: Growth ──
  { id: "w3d1", day: 15, week: 3, title: "Engage with every comment", desc: "Reply to every comment on your videos within 24h.", xp: 30 },
  { id: "w3d2", day: 16, week: 3, title: "Community post", desc: "Post a poll or update in your Community tab.", xp: 30 },
  { id: "w3d3", day: 17, week: 3, title: "Collaboration outreach", desc: "DM 3 creators in your niche about collab ideas.", xp: 60 },
  { id: "w3d4", day: 18, week: 3, title: "Upload video №4", desc: "Apply audience feedback from first 3 videos.", xp: 100 },
  { id: "w3d5", day: 19, week: 3, title: "Cross-promote on social", desc: "Share your video on Twitter, Reddit, or Discord.", xp: 40 },
  { id: "w3d6", day: 20, week: 3, title: "Analyse CTR & retention", desc: "Use YouTube Studio to study what's working and adjust.", xp: 40 },
  { id: "w3d7", day: 21, week: 3, title: "Upload video №5", desc: "Halfway milestone — reflect & refine.", xp: 100 },

  // ── Week 4: Scale ──
  { id: "w4d1", day: 22, week: 4, title: "Create a series playlist", desc: "Organise your videos into a binge-worthy playlist.", xp: 30 },
  { id: "w4d2", day: 23, week: 4, title: "Upload video №6", desc: "Lean into your best-performing format.", xp: 100 },
  { id: "w4d3", day: 24, week: 4, title: "Audience survey", desc: "Ask viewers what they want next (Community tab or form).", xp: 40 },
  { id: "w4d4", day: 25, week: 4, title: "Upload video №7", desc: "Keep the streak alive.", xp: 100 },
  { id: "w4d5", day: 26, week: 4, title: "Optimise your channel homepage", desc: "Featured video, sections, trailer for non-subs.", xp: 40 },
  { id: "w4d6", day: 27, week: 4, title: "Upload video №8", desc: "Final push — your best video yet.", xp: 100 },
  { id: "w4d7", day: 28, week: 4, title: "Upload video №9", desc: "9th video in 30 days — you're a creator now.", xp: 100 },
  { id: "w4d8", day: 29, week: 4, title: "Review & celebrate wins", desc: "Document what worked, what didn't, plan next 30 days.", xp: 50 },
  { id: "w4d9", day: 30, week: 4, title: "Final push to 1k", desc: "Share your journey video, ask for subs, engage hard.", xp: 150 },
];

/* ─── Badges ────────────────────────────────────────── */

interface Badge {
  id: string;
  label: string;
  icon: React.ReactNode;
  check: (done: number) => boolean;
}

const BADGES: Badge[] = [
  { id: "first-video", label: "First Video", icon: <Video className="h-4 w-4" />, check: (d) => d >= 1 },
  { id: "3-videos", label: "Consistent", icon: <BarChart3 className="h-4 w-4" />, check: (d) => d >= 6 },
  { id: "5-videos", label: "Creator", icon: <TrendingUp className="h-4 w-4" />, check: (d) => d >= 12 },
  { id: "9-videos", label: "Machine", icon: <Zap className="h-4 w-4" />, check: (d) => d >= 21 },
  { id: "week-1", label: "Week 1 Complete", icon: <Medal className="h-4 w-4" />, check: (d) => d >= 7 },
  { id: "week-2", label: "Week 2 Complete", icon: <Medal className="h-4 w-4" />, check: (d) => d >= 14 },
  { id: "week-3", label: "Week 3 Complete", icon: <Medal className="h-4 w-4" />, check: (d) => d >= 21 },
  { id: "completed", label: "30-Day Champion", icon: <Crown className="h-4 w-4" />, check: (d) => d >= QUESTS.length },
];

/* ─── Helpers ───────────────────────────────────────── */

const PROGRESS_KEY = "forge_challenge_30d_progress";
const COMPLETED_AT_KEY = "forge_challenge_30d_completed_at";
const INPUTS_KEY = "forge_challenge_30d_inputs";

function loadProgress(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function loadCompletedAt(): Record<number, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COMPLETED_AT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadInputs(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(INPUTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/* ─── Tiers ─────────────────────────────────────────── */

function tierLabel(xp: number) {
  if (xp >= 2000) return { label: "Elite Creator", icon: Crown, color: "text-yellow-400" };
  if (xp >= 1400) return { label: "Video Machine", icon: Zap, color: "text-violet-400" };
  if (xp >= 800) return { label: "Rising Star", icon: Star, color: "text-amber-400" };
  if (xp >= 300) return { label: "Apprentice", icon: Target, color: "text-sky-400" };
  return { label: "Newcomer", icon: Users, color: "text-muted-foreground" };
}

/* ─── helpers ───────────────────────────────────────── */

function questsByDay(day: number) {
  return QUESTS.filter((q) => q.day === day);
}

function dayIsFullyDone(day: number, done: Set<string>) {
  return questsByDay(day).every((q) => done.has(q.id));
}

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

/* ─── Page ──────────────────────────────────────────── */

export default function Challenge30DaysPage() {
  const [done, setDone] = useState<Set<string>>(loadProgress);
  const [completedAt, setCompletedAt] = useState<Record<number, number>>(loadCompletedAt);
  const [inputs, setInputs] = useState<Record<string, string>>(loadInputs);
  const [expandedWeek, setExpandedWeek] = useState<number>(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const completedCount = done.size;
  const totalQuests = QUESTS.length;
  const totalXp = [...done].reduce((sum, id) => {
    const q = QUESTS.find((q) => q.id === id);
    return sum + (q?.xp ?? 0);
  }, 0);
  const tier = tierLabel(totalXp);
  const currentStreak = computeStreak(done, QUESTS);

  const challengeDay = Math.min(
    Math.max(Math.floor((now - Date.parse("2025-01-01")) / 86400000) + 1, 1),
    30,
  );

  /* ─── tick every second for countdown ─── */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ─── persist ─── */
  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
  }, [done]);

  useEffect(() => {
    localStorage.setItem(COMPLETED_AT_KEY, JSON.stringify(completedAt));
  }, [completedAt]);

  useEffect(() => {
    localStorage.setItem(INPUTS_KEY, JSON.stringify(inputs));
  }, [inputs]);

  useEffect(() => {
    if (completedCount === totalQuests && !showCelebration) {
      queueMicrotask(() => setShowCelebration(true));
    }
  }, [completedCount, totalQuests, showCelebration]);

  /* ─── detect newly-completed days ─── */
  useEffect(() => {
    const next = { ...completedAt };
    let changed = false;
    for (const d of DAYS) {
      if (next[d] == null && dayIsFullyDone(d, done)) {
        next[d] = Date.now();
        changed = true;
      }
    }
    if (changed) {
      queueMicrotask(() => setCompletedAt(next));
    }
  }, [done, completedAt]);

  /* ─── day lock logic ─── */
  function isDayLocked(day: number): { locked: true; remainingMs: number } | { locked: false } {
    if (day === 1) return { locked: false };
    const prevDay = day - 1;
    if (!dayIsFullyDone(prevDay, done)) return { locked: true, remainingMs: Infinity };
    const prevCompletedAt = completedAt[prevDay];
    if (prevCompletedAt == null) return { locked: true, remainingMs: Infinity };
    const elapsed = now - prevCompletedAt;
    if (elapsed >= COOLDOWN_MS) return { locked: false };
    return { locked: true, remainingMs: COOLDOWN_MS - elapsed };
  }

  function unlockedDayCount() {
    for (let d = 1; d <= 30; d++) {
      const status = isDayLocked(d);
      if (status.locked) return d - 1;
    }
    return 30;
  }

  const toggleQuest = useCallback(
    (id: string) => {
      const q = QUESTS.find((q) => q.id === id);
      if (!q) return;
      const status = isDayLocked(q.day);
      if (status.locked) return;
      if (!done.has(id) && !(inputs[id]?.trim())) return;
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [isDayLocked, inputs],
  );

  const weekQuests = (weekIdx: number) => QUESTS.filter((q) => q.week === weekIdx);
  const weekDone = (weekIdx: number) => weekQuests(weekIdx).filter((q) => done.has(q.id)).length;
  const weekTotal = (weekIdx: number) => weekQuests(weekIdx).length;
  const weekXp = (weekIdx: number) =>
    weekQuests(weekIdx)
      .filter((q) => done.has(q.id))
      .reduce((s, q) => s + q.xp, 0);

  /* ─── Reset ──────────────────────────────────────── */
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  function handleReset() {
    setDone(new Set());
    setCompletedAt({});
    setInputs({});
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(COMPLETED_AT_KEY);
    localStorage.removeItem(INPUTS_KEY);
    setShowResetConfirm(false);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ GROW · 30 DAYS TO 1K"
        title="30 Days to 1 k"
        subtitle="Bootstrapped YouTube growth — one quest at a time."
        action={
          <button
            onClick={() => setShowResetConfirm(true)}
            className="rounded border border-border/50 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:border-red-400/40 hover:text-red-400 transition"
          >
            Reset
          </button>
        }
      />

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-sm border-border/50">
            <CardHeader>
              <CardTitle>Reset Challenge?</CardTitle>
              <CardDescription>This will clear all your progress. Are you sure?</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 rounded bg-red-500/20 px-4 py-2 text-sm text-red-400 hover:bg-red-500/30 transition"
              >
                Yes, reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-muted/80 transition"
              >
                Cancel
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Celebration overlay ── */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md border-emerald-500/30 text-center">
            <CardHeader>
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <Crown className="h-8 w-8 text-emerald-400" />
              </div>
              <CardTitle className="text-xl">Challenge Complete!</CardTitle>
              <CardDescription>
                You completed all 30 quests and earned <span className="font-bold text-primary">{totalXp} XP</span>.
                {" "}Go claim your 1 k subscribers!
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <button
                onClick={() => setShowCelebration(false)}
                className="flex-1 rounded bg-primary/20 px-4 py-2 text-sm text-primary hover:bg-primary/30 transition"
              >
                Keep going
              </button>
              {navigator.share && (
                <button
                  onClick={() => navigator.share({ title: "I just completed the 30 Days to 1k Challenge!", url: window.location.href })}
                  className="flex items-center justify-center gap-2 rounded bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-muted/80 transition"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Badges ── */}
      <Card className="mb-8 border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            <CardTitle>Badges</CardTitle>
          </div>
          <CardDescription>Milestones unlocked by completing quests.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {BADGES.map((badge) => {
              const unlocked = badge.check(completedCount);
              return (
                <div
                  key={badge.id}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition ${
                    unlocked
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                      : "border-border/30 text-muted-foreground/40"
                  }`}
                >
                  {unlocked ? badge.icon : <Lock className="h-3.5 w-3.5" />}
                  <span className="font-medium">{badge.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Hero stats bar ── */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="flex flex-col items-center justify-center border-border/50 py-4 text-center">
          <p className="font-display text-3xl font-bold tabular-nums">{completedCount}</p>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Quests done
          </p>
        </Card>
        <Card className="flex flex-col items-center justify-center border-border/50 py-4 text-center">
          <p className="font-display text-3xl font-bold tabular-nums">{totalXp}</p>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            XP earned
          </p>
        </Card>
        <Card className="flex flex-col items-center justify-center border-border/50 py-4 text-center">
          <div className="flex items-center gap-1.5">
            {currentStreak > 0 && <Flame className="h-4 w-4 text-orange-400" />}
            <p className="font-display text-3xl font-bold tabular-nums">{currentStreak}</p>
          </div>
          <p className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Day streak
          </p>
        </Card>
        <Card className="flex flex-col items-center justify-center border-border/50 py-4 text-center">
          <TierIcon icon={tier.icon} className={`h-5 w-5 ${tier.color}`} />
          <p className={`mt-1 font-display text-lg font-bold ${tier.color}`}>{tier.label}</p>
        </Card>
      </div>

      {/* ── Day progress grid ── */}
      <Card className="mb-8 border-border/50">
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Journey to 1 k</span>
            <span className="font-mono tabular-nums text-primary">
              {Math.round((completedCount / totalQuests) * 100)}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700"
              style={{ width: `${(completedCount / totalQuests) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {unlockedDayCount()} days unlocked · {totalQuests - completedCount} quests remaining
          </p>
        </CardContent>
      </Card>

      {/* ── Countdown banner ── */}
      {(() => {
        const cooldownDay = DAYS.find((d) => {
          const s = isDayLocked(d);
          return s.locked && s.remainingMs !== Infinity;
        });
        if (!cooldownDay) return null;
        const s = isDayLocked(cooldownDay) as { locked: true; remainingMs: number };
        return (
          <Card className="mb-8 border-amber-500/20 bg-amber-500/5">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                <Timer className="h-5 w-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-300">
                  Day {cooldownDay} unlocking soon
                </p>
                <p className="text-xs text-amber-400/70">
                  Day {cooldownDay - 1} quests are done — next day unlocks when the timer runs out.
                </p>
              </div>
              <span className="shrink-0 font-mono text-2xl font-bold tabular-nums text-amber-400">
                {formatCountdown(s.remainingMs)}
              </span>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Weekly phases ── */}
      <div className="space-y-4">
        {WEEKLY_PHASES.map((phase) => {
          const wDone = weekDone(phase.week);
          const wTotal = weekTotal(phase.week);
          const pct = wTotal > 0 ? Math.round((wDone / wTotal) * 100) : 0;
          const open = expandedWeek === phase.week;
          const quests = weekQuests(phase.week);

          const weekLockStatus = quests.map((q) => isDayLocked(q.day));
          const anyLocked = weekLockStatus.some((s) => s.locked);

          return (
            <Card
              key={phase.week}
              className={`overflow-hidden border-l-4 ${phase.border} border-border/50 transition`}
            >
              <button
                onClick={() => setExpandedWeek(open ? -1 : phase.week)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${phase.color}`}>
                  <span className={`text-sm font-bold ${phase.accent}`}>{phase.week}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold">{phase.label}</p>
                  <p className="text-xs text-muted-foreground">{phase.subtitle}</p>
                </div>
                <div className="hidden items-center gap-3 sm:flex">
                  <span className="text-xs text-muted-foreground">
                    {wDone}/{wTotal}
                  </span>
                  <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {weekXp(phase.week)} XP
                  </span>
                  {open ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {open && (
                <div className="divide-y divide-border/30 border-t border-border/30">
                  {quests.map((q) => {
                    const isDone = done.has(q.id);
                    const status = isDayLocked(q.day);
                    const locked = status.locked;
                    const inputVal = inputs[q.id] ?? "";
                    const needsInput = !locked && !isDone && !inputVal.trim();

                    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
                      setInputs((prev) => ({ ...prev, [q.id]: e.target.value }));
                    }

                    return (
                      <div
                        key={q.id}
                        className={`flex items-start gap-3 px-5 py-3 transition ${locked ? "opacity-40" : ""}`}
                      >
                        <button
                          onClick={() => toggleQuest(q.id)}
                          disabled={locked || needsInput}
                          className="mt-0.5 shrink-0"
                        >
                          {locked ? (
                            <Lock className="h-5 w-5 text-muted-foreground/30" />
                          ) : isDone ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className={`h-5 w-5 ${needsInput ? "text-muted-foreground/20" : "text-muted-foreground/40"}`} />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${isDone ? "line-through" : ""} ${locked ? "text-muted-foreground/60" : ""}`}>
                            Day {q.day}: {q.title}
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            {locked && status.remainingMs !== Infinity
                              ? `Unlocks in ${formatCountdown(status.remainingMs)}`
                              : q.desc}
                          </p>
                          {!locked && (
                            <input
                              type="text"
                              placeholder={
                                isDone
                                  ? inputVal
                                  : "Paste link or add notes as proof…"
                              }
                              value={inputVal}
                              onChange={handleInputChange}
                              readOnly={isDone}
                              className={`mt-2 w-full rounded border bg-transparent px-3 py-1.5 text-xs outline-none transition ${
                                isDone
                                  ? "border-transparent text-muted-foreground/50 italic"
                                  : "border-border/40 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50"
                              }`}
                            />
                          )}
                        </div>
                        <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
                          {locked ? (
                            <Hourglass className="h-3.5 w-3.5 text-amber-400/50" />
                          ) : (
                            `+${q.xp} XP`
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}

/* ─── Component helpers ─────────────────────────────── */

function TierIcon({ icon: Icon, className }: { icon: React.ElementType; className: string }) {
  return <Icon className={className} />;
}

function computeStreak(done: Set<string>, quests: Quest[]): number {
  const doneDays = quests.filter((q) => done.has(q.id)).map((q) => q.day);
  if (doneDays.length === 0) return 0;
  const maxDay = Math.max(...doneDays);
  let streak = 0;
  for (let d = maxDay; d >= 1; d--) {
    const dayQuests = quests.filter((q) => q.day === d);
    const allDone = dayQuests.every((q) => done.has(q.id));
    if (allDone) streak++;
    else break;
  }
  return streak;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${m}m ${s}s`;
}

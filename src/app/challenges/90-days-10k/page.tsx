"use client";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Trophy,
  Zap,
  Flame,
  Target,
  CheckCircle2,
  Circle,

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
  Hourglass,
  DollarSign,
  Briefcase,
  GraduationCap,
  Rocket,
  GitBranch,
  Megaphone,
  ShoppingCart,
  Globe,
  BookOpen,
  ChevronDown,
} from "lucide-react";

/* ─── Data ─────────────────────────────────────────── */

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const MONTHLY_PHASES = [
  {
    month: 1,
    label: "Launch Pad",
    subtitle: "Niche, brand & content engine",
    color: "from-sky-500/20 to-sky-600/10",
    border: "border-sky-500/30",
    accent: "text-sky-400",
  },
  {
    month: 2,
    label: "Accelerator",
    subtitle: "Growth, audience & optimisation",
    color: "from-violet-500/20 to-violet-600/10",
    border: "border-violet-500/30",
    accent: "text-violet-400",
  },
  {
    month: 3,
    label: "Monetizer",
    subtitle: "Revenue streams & $10k systems",
    color: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/30",
    accent: "text-amber-400",
  },
];

interface Quest {
  id: string;
  day: number;
  month: number;
  week: number;
  title: string;
  desc: string;
  xp: number;
}

const QUESTS: Quest[] = [
  /* ═══════════════════════════════════════════════════════
     MONTH 1: LAUNCH PAD
     ═══════════════════════════════════════════════════════ */

  /* ── Week 1: Niche & Market Research ── */
  { id: "m1w1d1", day: 1, month: 1, week: 1, title: "Define your $10k niche", desc: "Pick a niche with high CPM ($15+), proven demand & monetisation potential. Think finance, business, AI, SaaS, coding, or self-improvement.", xp: 80 },
  { id: "m1w1d2", day: 2, month: 1, week: 1, title: "Validate niche profitability", desc: "Use Google Trends + YouTube search to confirm growing interest. Check AFK, VidIQ, or similar tools for competition levels.", xp: 60 },
  { id: "m1w1d3", day: 3, month: 1, week: 1, title: "Research 20 competitor channels", desc: "Analyse thumbnails, titles, hooks, posting frequency, and video length. Build a spreadsheet of what works.", xp: 70 },
  { id: "m1w1d4", day: 4, month: 1, week: 1, title: "Deconstruct top 10 videos", desc: "Watch the 10 highest-performing videos in your niche. Note retention curves, hooks, CTAs, and production quality.", xp: 60 },
  { id: "m1w1d5", day: 5, month: 1, week: 1, title: "Build your audience avatar", desc: "Write a detailed profile of your ideal viewer: age, goals, pain points, objections, where they hang out online.", xp: 50 },
  { id: "m1w1d6", day: 6, month: 1, week: 1, title: "Keyword research — 100 terms", desc: "Use YouTube search, VidIQ, or TubeBuddy to compile 100 keywords with monthly search volume and competition level.", xp: 80 },
  { id: "m1w1d7", day: 7, month: 1, week: 1, title: "Create 30 video title bank", desc: "Write 30 clickable video titles using your keyword research. Aim for curiosity gaps, numbers, and emotional triggers.", xp: 60 },

  /* ── Week 2: Channel & Brand Foundation ── */
  { id: "m1w2d1", day: 8, month: 1, week: 2, title: "Full channel branding setup", desc: "Banner, profile picture, channel description with keywords, links to socials, and a trailer for non-subs.", xp: 50 },
  { id: "m1w2d2", day: 9, month: 1, week: 2, title: "Design thumbnail template", desc: "Create a consistent thumbnail style with face, bold text, and brand colours. Use Canva, Photoshop, or Photopea.", xp: 70 },
  { id: "m1w2d3", day: 10, month: 1, week: 2, title: "Write channel about section", desc: "Craft a compelling channel description that tells visitors what to expect and why to subscribe.", xp: 40 },
  { id: "m1w2d4", day: 11, month: 1, week: 2, title: "Set up cross-platform presence", desc: "Create/optimise Twitter/X, LinkedIn, Instagram or TikTok handles for your brand. Consistent username and bio.", xp: 50 },
  { id: "m1w2d5", day: 12, month: 1, week: 2, title: "Build email capture system", desc: "Set up a free Mailchimp, ConvertKit, or Beehiiv account. Create an opt-in lead magnet related to your niche.", xp: 80 },
  { id: "m1w2d6", day: 13, month: 1, week: 2, title: "Create scripting template", desc: "Build a repeatable script structure: hook (5s) → problem → solution → proof → CTA. Write your first full script.", xp: 60 },
  { id: "m1w2d7", day: 14, month: 1, week: 2, title: "Record & upload channel trailer", desc: "Make a 60-90 second trailer explaining who you are and what your channel delivers. Add to channel homepage.", xp: 90 },

  /* ── Week 3: Production System ── */
  { id: "m1w3d1", day: 15, month: 1, week: 3, title: "Set up recording studio", desc: "Optimise your recording space: lighting, microphone placement, background, camera angle. Test audio levels.", xp: 50 },
  { id: "m1w3d2", day: 16, month: 1, week: 3, title: "Learn editing essentials", desc: "Master cuts, transitions, text overlays, B-roll, and audio levelling in your editor (DaVinci, Premiere, CapCut).", xp: 80 },
  { id: "m1w3d3", day: 17, month: 1, week: 3, title: "Create intro & outro templates", desc: "Design a 3-5 second intro bumper and an outro with subscribe button, suggested videos, and links.", xp: 60 },
  { id: "m1w3d4", day: 18, month: 1, week: 3, title: "Batch-record 3 video scripts", desc: "Record all three scripts in one session. Consistent lighting, energy, and audio across all takes.", xp: 120 },
  { id: "m1w3d5", day: 19, month: 1, week: 3, title: "Edit video №1", desc: "Full edit: cuts, pacing, B-roll, captions, background music, colour grade. Export in 1080p 60fps.", xp: 100 },
  { id: "m1w3d6", day: 20, month: 1, week: 3, title: "Design thumbnail for video №1", desc: "Create a high-CTR thumbnail with your face expressing emotion, contrasting colours, and 3-4 word text overlay.", xp: 70 },
  { id: "m1w3d7", day: 21, month: 1, week: 3, title: "Edit video №2", desc: "Apply lessons from video 1 edit. Aim to be 10% faster and 10% better.", xp: 100 },

  /* ── Week 4: Launch & Iterate ── */
  { id: "m1w4d1", day: 22, month: 1, week: 4, title: "Publish video №1", desc: "Upload with SEO-optimised title, description (500+ words), tags, end screens, cards, and custom thumbnail.", xp: 150 },
  { id: "m1w4d2", day: 23, month: 1, week: 4, title: "Analyse video №1 first 24h", desc: "Study CTR, retention graph, traffic sources, and audience demographics. Document 3 things to improve.", xp: 60 },
  { id: "m1w4d3", day: 24, month: 1, week: 4, title: "Engage every comment on video 1", desc: "Reply to every comment within 24h. Ask questions to keep the conversation going.", xp: 40 },
  { id: "m1w4d4", day: 25, month: 1, week: 4, title: "Publish video №2", desc: "Implement improvements from video 1 analysis. Optimise metadata before publishing.", xp: 150 },
  { id: "m1w4d5", day: 26, month: 1, week: 4, title: "Create & post a YouTube Short", desc: "Repurpose the best 30-60 seconds from video 1 or 2 into a vertical Short. #shorts", xp: 50 },
  { id: "m1w4d6", day: 27, month: 1, week: 4, title: "Publish video №3", desc: "Third video in 4 weeks. You should be faster and more confident now.", xp: 150 },
  { id: "m1w4d7", day: 28, month: 1, week: 4, title: "Cross-post to Twitter & LinkedIn", desc: "Share your video with a thread or post. Write a compelling hook, not just a link drop.", xp: 50 },
  { id: "m1w4d8", day: 29, month: 1, week: 4, title: "Create a community post", desc: "Post a poll, update, or behind-the-scenes to your Community tab. Drive engagement.", xp: 40 },
  { id: "m1w4d9", day: 30, month: 1, week: 4, title: "Month 1 review & strategy audit", desc: "Document what worked, what flopped. Review analytics. Plan content adjustments for month 2.", xp: 80 },

  /* ═══════════════════════════════════════════════════════
     MONTH 2: ACCELERATOR
     ═══════════════════════════════════════════════════════ */

  /* ── Week 5: Data-Driven Optimisation ── */
  { id: "m2w5d1", day: 31, month: 2, week: 5, title: "Deep analytics audit", desc: "Analyse CTR, retention, average view duration, and traffic sources across all 3 videos. Identify patterns.", xp: 70 },
  { id: "m2w5d2", day: 32, month: 2, week: 5, title: "A/B test a thumbnail", desc: "Create an alternate thumbnail for your worst-performing video. Use YouTube's test feature or manual swap.", xp: 60 },
  { id: "m2w5d3", day: 33, month: 2, week: 5, title: "Optimise video metadata retroactively", desc: "Improve titles, descriptions, and tags on all published videos based on what's driving traffic.", xp: 50 },
  { id: "m2w5d4", day: 34, month: 2, week: 5, title: "Publish video №4", desc: "Apply all data-driven improvements. Write a better hook than any previous video.", xp: 150 },
  { id: "m2w5d5", day: 35, month: 2, week: 5, title: "Create a content upgrade", desc: "Turn one video topic into a downloadable resource (checklist, template, PDF) for email capture.", xp: 80 },
  { id: "m2w5d6", day: 36, month: 2, week: 5, title: "Improve audience retention", desc: "Re-watch your lowest-retention video. Add jump cuts, visual variety, and remove dead air.", xp: 70 },
  { id: "m2w5d7", day: 37, month: 2, week: 5, title: "Publish video №5", desc: "Focus on retention above all else. Aim for 40%+ average view duration.", xp: 150 },

  /* ── Week 6: Audience Building ── */
  { id: "m2w6d1", day: 38, month: 2, week: 6, title: "Community tab content plan", desc: "Schedule 7 community posts for the week: polls, updates, Q&As, teasers, and gratitude posts.", xp: 40 },
  { id: "m2w6d2", day: 39, month: 2, week: 6, title: "Engage on 10 similar channels", desc: "Leave thoughtful comments on 10 channels in your niche. First 30 minutes = best engagement window.", xp: 50 },
  { id: "m2w6d3", day: 40, month: 2, week: 6, title: "Publish video №6", desc: "Lean into the video format that performed best so far. Double down on winners.", xp: 150 },
  { id: "m2w6d4", day: 41, month: 2, week: 6, title: "Create a binge-worthy playlist", desc: "Organise your videos into a series playlist that auto-plays next. Name it with keywords.", xp: 40 },
  { id: "m2w6d5", day: 42, month: 2, week: 6, title: "Launch audience survey", desc: "Use YouTube Community tab or Google Forms to ask viewers what they want next.", xp: 50 },
  { id: "m2w6d6", day: 43, month: 2, week: 6, title: "Publish video №7", desc: "Make a video based directly on audience survey responses. Signal that you listen.", xp: 150 },
  { id: "m2w6d7", day: 44, month: 2, week: 6, title: "Start a discussion thread", desc: "Post a controversial or thought-provoking question in Community tab. Spark a conversation.", xp: 40 },

  /* ── Week 7: Collaboration & Networks ── */
  { id: "m2w7d1", day: 45, month: 2, week: 7, title: "Identify 10 collaboration targets", desc: "Find 10 creators at similar or slightly higher sub counts. Note their email or social contact.", xp: 60 },
  { id: "m2w7d2", day: 46, month: 2, week: 7, title: "Write collab outreach templates", desc: "Draft a short, personalised outreach message. Value-first: what's in it for them?", xp: 50 },
  { id: "m2w7d3", day: 47, month: 2, week: 7, title: "Publish video №8", desc: "Continue your content streak. Consistency compounds.", xp: 150 },
  { id: "m2w7d4", day: 48, month: 2, week: 7, title: "Send 5 collaboration emails", desc: "Personalise each outreach. Reference their content and propose a specific collab idea.", xp: 80 },
  { id: "m2w7d5", day: 49, month: 2, week: 7, title: "Join 3 creator communities", desc: "Find and join relevant Discord servers, subreddits, or Facebook groups for creators in your niche.", xp: 40 },
  { id: "m2w7d6", day: 50, month: 2, week: 7, title: "Publish video №9", desc: "If a collab was accepted, publish it here. Otherwise, publish your best solo video yet.", xp: 150 },
  { id: "m2w7d7", day: 51, month: 2, week: 7, title: "Cross-promote with a creator", desc: "Shout out each other's channels, do a mention swap, or appear in each other's videos.", xp: 100 },

  /* ── Week 8: Content Expansion ── */
  { id: "m2w8d1", day: 52, month: 2, week: 8, title: "Launch a second content format", desc: "Add a new video type: tutorials, case studies, news analysis, or vlogs. Diversify your content.", xp: 80 },
  { id: "m2w8d2", day: 53, month: 2, week: 8, title: "Repurpose video to Twitter thread", desc: "Turn your best video into a 10-tweet thread with takeaways, screenshots, and a link.", xp: 50 },
  { id: "m2w8d3", day: 54, month: 2, week: 8, title: "Publish video №10", desc: "Double-digit videos. You're building real momentum now.", xp: 150 },
  { id: "m2w8d4", day: 55, month: 2, week: 8, title: "Create a resource landing page", desc: "Build a simple page with links to all your videos, recommendations, and affiliate products.", xp: 70 },
  { id: "m2w8d5", day: 56, month: 2, week: 8, title: "Host a live stream", desc: "Go live for 30+ minutes. Q&A, behind-the-scenes, or co-working. Live engagement boosts the algorithm.", xp: 120 },
  { id: "m2w8d6", day: 57, month: 2, week: 8, title: "Publish video №11", desc: "Feature your best-performing format again. Refine and improve.", xp: 150 },
  { id: "m2w8d7", day: 58, month: 2, week: 8, title: "Create a lead magnet", desc: "A free PDF, checklist, template, or mini-course that solves a specific problem. Gate behind email.", xp: 100 },
  { id: "m2w8d8", day: 59, month: 2, week: 8, title: "Publish video №12", desc: "12 videos in 60 days — most creators quit by now. You're in the top 1%.", xp: 200 },
  { id: "m2w8d9", day: 60, month: 2, week: 8, title: "Month 2 review + pivot", desc: "Audit growth metrics. Decide what to stop, start, and continue for month 3. Revenue potential check.", xp: 80 },

  /* ═══════════════════════════════════════════════════════
     MONTH 3: MONETIZER
     ═══════════════════════════════════════════════════════ */

  /* ── Week 9: AdSense & Affiliate Revenue ── */
  { id: "m3w9d1", day: 61, month: 3, week: 9, title: "Apply for YouTube Partner Program", desc: "If eligible (1k subs + 4k watch hours), apply for YPP. Set up AdSense account.", xp: 200 },
  { id: "m3w9d2", day: 62, month: 3, week: 9, title: "Research top affiliate products", desc: "Find 20 products/tools your audience needs. Check commissions, cookie duration, and conversion rates.", xp: 70 },
  { id: "m3w9d3", day: 63, month: 3, week: 9, title: "Join 5 affiliate programs", desc: "Apply to Amazon Associates, ClickBank, ShareASale, Impact, or niche-specific affiliate networks.", xp: 60 },
  { id: "m3w9d4", day: 64, month: 3, week: 9, title: "Create an affiliate resource page", desc: "A simple page listing your recommended tools with affiliate links. Add to your channel description.", xp: 70 },
  { id: "m3w9d5", day: 65, month: 3, week: 9, title: "Publish affiliate-focused video", desc: "Create a 'top tools' or 'resources I use' video with affiliate links in the description.", xp: 150 },
  { id: "m3w9d6", day: 66, month: 3, week: 9, title: "Set up affiliate link tracking", desc: "Use a link shortener or tracking tool to monitor click-through rates and conversions.", xp: 40 },
  { id: "m3w9d7", day: 67, month: 3, week: 9, title: "Publish video №13", desc: "Continue regular uploads while building revenue streams.", xp: 150 },

  /* ── Week 10: Digital Products ── */
  { id: "m3w10d1", day: 68, month: 3, week: 10, title: "Identify digital product opportunity", desc: "Survey your audience. What's the #1 problem you could solve with a course, template, or toolkit?", xp: 70 },
  { id: "m3w10d2", day: 69, month: 3, week: 10, title: "Outline your digital product", desc: "Write a full outline: modules, chapters, deliverables, and transformation promised.", xp: 80 },
  { id: "m3w10d3", day: 70, month: 3, week: 10, title: "Create product content — session 1", desc: "Record/write first 30% of your product. High production value, clear outcomes.", xp: 150 },
  { id: "m3w10d4", day: 71, month: 3, week: 10, title: "Create product content — session 2", desc: "Complete the next 40% of your product. Include worksheets or actionable templates.", xp: 150 },
  { id: "m3w10d5", day: 72, month: 3, week: 10, title: "Finish product content", desc: "Wrap up final 30%. Review, polish, and add bonus material for perceived value.", xp: 150 },
  { id: "m3w10d6", day: 73, month: 3, week: 10, title: "Set up payment & delivery", desc: "Use Gumroad, LemonSqueezy, Stripe, or Payhip. Test the purchase flow end-to-end.", xp: 80 },
  { id: "m3w10d7", day: 74, month: 3, week: 10, title: "Publish product launch video", desc: "Launch video + email list announcement + social posts. First 24h are critical for momentum.", xp: 200 },

  /* ── Week 11: Sponsorships & Memberships ── */
  { id: "m3w11d1", day: 75, month: 3, week: 11, title: "Create your media kit", desc: "One-page PDF with channel stats, audience demographics, past brands, and sponsorship tier pricing.", xp: 80 },
  { id: "m3w11d2", day: 76, month: 3, week: 11, title: "Research 20 sponsor targets", desc: "Find brands that sponsor creators in your niche. Look at who advertises in similar channels.", xp: 60 },
  { id: "m3w11d3", day: 77, month: 3, week: 11, title: "Send 10 sponsorship pitches", desc: "Personalised outreach to brands. Include media kit, a specific collab idea, and pricing.", xp: 120 },
  { id: "m3w11d4", day: 78, month: 3, week: 11, title: "Set up membership tier", desc: "Create a Patreon, YouTube Membership, or Ko-fi with 2-3 exclusive benefits.", xp: 80 },
  { id: "m3w11d5", day: 79, month: 3, week: 11, title: "Create members-only content", desc: "Publish your first piece of exclusive content for members. Bonus video, behind-the-scenes, or early access.", xp: 100 },
  { id: "m3w11d6", day: 80, month: 3, week: 11, title: "Publish video №14", desc: "Mention your membership or product naturally within the video. Provide value first.", xp: 150 },
  { id: "m3w11d7", day: 81, month: 3, week: 11, title: "Follow up on sponsorship outreach", desc: "Politely follow up with brands that didn't respond. Persistence pays off.", xp: 50 },

  /* ── Week 12: Scale to $10k ── */
  { id: "m3w12d1", day: 82, month: 3, week: 12, title: "Revenue audit & gap analysis", desc: "Calculate current monthly revenue from all streams. Identify the biggest gap to $10k.", xp: 80 },
  { id: "m3w12d2", day: 83, month: 3, week: 12, title: "Scale your best revenue stream", desc: "Double down on whatever is generating the most revenue. Create more of it.", xp: 150 },
  { id: "m3w12d3", day: 84, month: 3, week: 12, title: "Build automation systems", desc: "Set up automated email sequences, social scheduling (Buffer/Hootsuite), and content calendar.", xp: 80 },
  { id: "m3w12d4", day: 85, month: 3, week: 12, title: "Hire or outsource one task", desc: "Find a VA, editor, or thumbnail designer on Upwork/Fiverr for a task that doesn't need you.", xp: 100 },
  { id: "m3w12d5", day: 86, month: 3, week: 12, title: "Launch second product or offer", desc: "Add another revenue stream: coaching calls, consulting, a smaller-priced product, or a physical item.", xp: 200 },
  { id: "m3w12d6", day: 87, month: 3, week: 12, title: "Optimise conversion funnel", desc: "Improve your video → email → product funnel. Test CTAs, landing pages, and pricing.", xp: 100 },
  { id: "m3w12d7", day: 88, month: 3, week: 12, title: "Batch-record next month's content", desc: "Record 4-5 videos in one session to stay ahead while you focus on revenue.", xp: 150 },
  { id: "m3w12d8", day: 89, month: 3, week: 12, title: "$10k milestone push", desc: "Execute your highest-leverage growth and revenue activity. One final sprint to the goal.", xp: 300 },
  { id: "m3w12d9", day: 90, month: 3, week: 12, title: "Celebrate & plan next 90 days", desc: "You completed 90 days. Document all revenue, subscribers, and lessons. Plan the next quarter.", xp: 200 },
];

/* ─── Badges ────────────────────────────────────────── */

interface Badge {
  id: string;
  label: string;
  icon: React.ReactNode;
  check: (done: number, total: number) => boolean;
}

const BADGES: Badge[] = [
  { id: "first-video", label: "First Video", icon: <Video className="h-4 w-4" />, check: (d) => d >= 1 },
  { id: "launch-pad", label: "Launch Pad Complete", icon: <Rocket className="h-4 w-4" />, check: (_, t) => t >= 30 },
  { id: "accelerator", label: "Accelerator Complete", icon: <Zap className="h-4 w-4" />, check: (_, t) => t >= 60 },
  { id: "monetizer", label: "Monetizer Complete", icon: <Briefcase className="h-4 w-4" />, check: (_, t) => t >= 90 },
  { id: "collaborator", label: "Collaborator", icon: <Users className="h-4 w-4" />, check: (d) => d >= 45 },
  { id: "affiliate-pro", label: "Affiliate Pro", icon: <ShoppingCart className="h-4 w-4" />, check: (d) => d >= 65 },
  { id: "product-creator", label: "Product Creator", icon: <BookOpen className="h-4 w-4" />, check: (d) => d >= 70 },
  { id: "completed", label: "$10k Achiever", icon: <Crown className="h-4 w-4" />, check: (d) => d >= QUESTS.length },
];

/* ─── Helpers ───────────────────────────────────────── */

const PROGRESS_KEY = "forge_challenge_90d_progress";
const COMPLETED_AT_KEY = "forge_challenge_90d_completed_at";
const INPUTS_KEY = "forge_challenge_90d_inputs";

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
  if (xp >= 14000) return { label: "$10k Champion", icon: Crown, color: "text-yellow-400" };
  if (xp >= 9000) return { label: "Monetization Pro", icon: Briefcase, color: "text-amber-400" };
  if (xp >= 5000) return { label: "Growth Accelerator", icon: TrendingUp, color: "text-violet-400" };
  if (xp >= 2000) return { label: "Content Machine", icon: Zap, color: "text-sky-400" };
  if (xp >= 500) return { label: "Apprentice Creator", icon: Target, color: "text-muted-foreground" };
  return { label: "Newcomer", icon: Users, color: "text-muted-foreground" };
}

/* ─── helpers ───────────────────────────────────────── */

function questsByDay(day: number) {
  return QUESTS.filter((q) => q.day === day);
}

function dayIsFullyDone(day: number, done: Set<string>) {
  return questsByDay(day).every((q) => done.has(q.id));
}

const DAYS = Array.from({ length: 90 }, (_, i) => i + 1);

/* ─── Page ──────────────────────────────────────────── */

export default function Challenge90DaysPage() {
  const [done, setDone] = useState<Set<string>>(loadProgress);
  const [completedAt, setCompletedAt] = useState<Record<number, number>>(loadCompletedAt);
  const [inputs, setInputs] = useState<Record<string, string>>(loadInputs);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [showCelebration, setShowCelebration] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(
    () => new Set(["0-0"]),
  );

  useEffect(() => {
    if (activeTab > 1 && !monthIsComplete(activeTab - 1)) {
      setActiveTab(1);
    }
  }, [done, activeTab]);

  const completedCount = done.size;
  const totalQuests = QUESTS.length;
  const totalXp = [...done].reduce((sum, id) => {
    const q = QUESTS.find((q) => q.id === id);
    return sum + (q?.xp ?? 0);
  }, 0);
  const tier = tierLabel(totalXp);
  const currentStreak = computeStreak(done, QUESTS);

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
      setShowCelebration(true);
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
    if (changed) setCompletedAt(next);
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
    for (let d = 1; d <= 90; d++) {
      const status = isDayLocked(d);
      if (status.locked) return d - 1;
    }
    return 90;
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

  const monthQuests = (monthIdx: number) => QUESTS.filter((q) => q.month === monthIdx);
  const monthDone = (monthIdx: number) => monthQuests(monthIdx).filter((q) => done.has(q.id)).length;
  const monthTotal = (monthIdx: number) => monthQuests(monthIdx).length;
  const monthIsComplete = (monthIdx: number) => monthDone(monthIdx) === monthTotal(monthIdx);
  const monthXp = (monthIdx: number) =>
    monthQuests(monthIdx)
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
        eyebrow="№ GROW · 90 DAYS TO $10K"
        title="90 Days to $10 k"
        subtitle="From zero to full-time creator income — monthly milestones."
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
              <CardDescription>This will clear all 90 days of progress. Are you sure?</CardDescription>
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
          <Card className="w-full max-w-md border-amber-500/30 text-center">
            <CardHeader>
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
                <Crown className="h-8 w-8 text-amber-400" />
              </div>
              <CardTitle className="text-xl">$10k Challenge Complete!</CardTitle>
              <CardDescription>
                You crushed all 90 quests and earned <span className="font-bold text-primary">{totalXp} XP</span>.
                {" "}Go claim your $10k month!
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <button
                onClick={() => setShowCelebration(false)}
                className="flex-1 rounded bg-primary/20 px-4 py-2 text-sm text-primary hover:bg-primary/30 transition"
              >
                Keep going
              </button>
              {typeof navigator !== "undefined" && navigator.share && (
                <button
                  onClick={() => navigator.share({ title: "I just completed the 90 Days to $10k Challenge!", url: window.location.href })}
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
              const unlocked = badge.check(completedCount, totalQuests);
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
          <div className={`flex items-center justify-center`}>
            <TierIcon icon={tier.icon} className={`h-5 w-5 ${tier.color}`} />
          </div>
          <p className={`mt-1 font-display text-lg font-bold ${tier.color}`}>{tier.label}</p>
        </Card>
      </div>

      {/* ── Revenue goal breakdown ── */}
      <Card className="mb-8 border-border/50">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-semibold">$10k Revenue Breakdown (target mix)</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="font-display text-lg font-bold text-sky-400">$2.5k</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">AdSense</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="font-display text-lg font-bold text-violet-400">$2.5k</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Affiliates</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="font-display text-lg font-bold text-amber-400">$3k</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Digital Products</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="font-display text-lg font-bold text-emerald-400">$1k</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sponsorships</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="font-display text-lg font-bold text-rose-400">$1k</p>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Memberships</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Day progress ── */}
      <Card className="mb-8 border-border/50">
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Journey to $10k</span>
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

      {/* ── Tab bar ── */}
      <div className="mb-6 flex gap-1 rounded-xl bg-muted/50 p-1">
        {MONTHLY_PHASES.map((phase) => {
          const mDone = monthDone(phase.month);
          const mTotal = monthTotal(phase.month);
          const active = activeTab === phase.month;
          const locked = phase.month > 1 && !monthIsComplete(phase.month - 1);
          return (
            <button
              key={phase.month}
              onClick={() => { if (!locked) setActiveTab(phase.month); }}
              disabled={locked}
              className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                locked
                  ? "cursor-not-allowed opacity-30"
                  : active
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${
                  phase.color
                } ${active || locked ? "" : "opacity-50"}`}
              >
                {locked ? (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <span className="text-[11px] font-bold">{phase.month}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold ${active ? "text-foreground" : locked ? "text-muted-foreground" : "text-muted-foreground"}`}>
                  {locked ? `Complete Month ${phase.month - 1} first` : phase.label}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {locked ? `${monthDone(phase.month - 1)}/${monthTotal(phase.month - 1)} done` : phase.subtitle}
                </p>
              </div>
              {!locked && (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {mDone}/{mTotal}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active month quests ── */}
      {(() => {
        const phase = MONTHLY_PHASES.find((p) => p.month === activeTab)!;
        const quests = monthQuests(phase.month);
        const mDone = monthDone(phase.month);
        const mTotal = monthTotal(phase.month);
        const pct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
        return (
          <Card className={`overflow-hidden border-l-4 ${phase.border} border-border/50`}>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${phase.color}`}>
                <span className={`text-sm font-bold ${phase.accent}`}>{phase.month}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold">{phase.label}</p>
                <p className="text-xs text-muted-foreground">{phase.subtitle}</p>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <span className="text-xs text-muted-foreground">{mDone}/{mTotal}</span>
                <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{monthXp(phase.month)} XP</span>
            </div>
            <div className="divide-y divide-border/30 border-t border-border/30">
              {[0, 1, 2].map((chunkIdx) => {
                const chunkStart = chunkIdx * 10 + 1;
                const chunkEnd = chunkIdx * 10 + 10;
                const chunkQuests = quests.filter((q) => q.day >= chunkStart && q.day <= chunkEnd);
                if (chunkQuests.length === 0) return null;
                const key = `${phase.month - 1}-${chunkIdx}`;
                const open = expandedChunks.has(key);
                const chunkDone = chunkQuests.filter((q) => done.has(q.id)).length;
                const chunkTotal = chunkQuests.length;
                return (
                  <div key={key} className="border-b border-border/30 last:border-b-0">
                    <button
                      onClick={() =>
                        setExpandedChunks((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-3 bg-muted/20 px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/40 transition"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition ${open ? "rotate-0" : "-rotate-90"}`}
                      />
                      Days {chunkStart}–{chunkEnd}
                      <span className="ml-auto font-mono text-[10px] normal-case tracking-normal">
                        {chunkDone}/{chunkTotal}
                      </span>
                    </button>
                    {open && (
                      <div className="divide-y divide-border/20">
                        {chunkQuests.map((q) => {
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
                                    placeholder={isDone ? inputVal : "Paste link or add notes as proof…"}
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
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
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

import type { ComponentType } from "react";
import { Lightbulb, ClipboardList, LayoutTemplate, Video, Scissors, Eye, UploadCloud, type LucideProps } from "lucide-react";
import type { ContentStage } from "./content-types";

/**
 * Same color story as Forge's STAGE_META: cool indigo (planning) -> warm
 * amber (making) -> rose (critical review) -> emerald (shipped), stepping
 * up in intensity within a hue. Only change is a muted-tone entry added for
 * IDEA, the stage before Forge's board began.
 */
export const STAGE_META: Record<ContentStage, { icon: ComponentType<LucideProps>; columnTone: string; chipTone: string }> = {
  IDEA: {
    icon: Lightbulb,
    columnTone: "border-border bg-muted/30",
    chipTone: "bg-muted text-muted-foreground",
  },
  SCRIPT: {
    icon: ClipboardList,
    columnTone: "border-indigo-stat/30 bg-indigo-stat/5",
    chipTone: "bg-indigo-stat/10 text-indigo-stat",
  },
  PREPRODUCTION: {
    icon: LayoutTemplate,
    columnTone: "border-indigo-stat/50 bg-indigo-stat/10",
    chipTone: "bg-indigo-stat/20 text-indigo-stat",
  },
  PRODUCTION: {
    icon: Video,
    columnTone: "border-amber-stat/30 bg-amber-stat/5",
    chipTone: "bg-amber-stat/10 text-amber-stat",
  },
  POST_PRODUCTION: {
    icon: Scissors,
    columnTone: "border-amber-stat/50 bg-amber-stat/10",
    chipTone: "bg-amber-stat/20 text-amber-stat",
  },
  IN_REVIEW: {
    icon: Eye,
    columnTone: "border-rose-stat/40 bg-rose-stat/5",
    chipTone: "bg-rose-stat/10 text-rose-stat",
  },
  PUBLISHED: {
    icon: UploadCloud,
    columnTone: "border-emerald-stat/50 bg-emerald-stat/10",
    chipTone: "bg-emerald-stat/15 text-emerald-stat",
  },
};

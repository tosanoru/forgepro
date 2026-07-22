/**
 * Estimated cost per generated thumbnail. Used to power the monthly spend
 * cap guardrail (see workspaceImageSettings.monthlyBudgetCents) — this is
 * deliberately a rounded-up conservative estimate so the guardrail errs
 * on the side of blocking too early rather than too late.
 *
 * OpenAI (gpt-image-1, 1536×1024): roughly $0.02–$0.19/image depending
 * on quality. 8¢ is a middle-ground estimate for the "auto" default
 * quality on a non-square canvas.
 *
 * Google Gemini 2.0 Flash: $0.15/image at standard quality.
 *
 * Nvidia NIM (SD3.5 Large via Nvidia API): $0.05/image.
 *
 * This is a deliberate overestimate for all providers — better for a
 * spend guardrail to conservatively overestimate than underestimate and
 * let a workspace blow past its budget.
 *
 * Maintenance note: gpt-image-1 is scheduled for retirement by OpenAI
 * (Oct 23, 2026) in favor of gpt-image-1.5 / gpt-image-2. This constant
 * and the model names in image-provider.ts will both need updating.
 */
export const THUMBNAIL_COST_ESTIMATE_CENTS = 8;

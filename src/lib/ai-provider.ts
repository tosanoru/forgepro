import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceAiSettings } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";

export type AIProvider = "anthropic" | "openai" | "deepseek" | "minimax" | "openrouter" | "nvidia" | "kimi" | "glm" | "google";

export class ProviderApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Ported verbatim from Forge's OPENAI_COMPATIBLE_CONFIG — provider list and
// base URLs don't change based on what we're generating.
const OPENAI_COMPATIBLE_CONFIG: Record<Exclude<AIProvider, "anthropic">, { baseURL: string; defaultModel: string }> = {
  openai: { baseURL: "https://api.openai.com/v1", defaultModel: "gpt-4.1-mini" },
  deepseek: { baseURL: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
  minimax: { baseURL: "https://api.minimax.io/v1", defaultModel: "MiniMax-Text-01" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o-mini" },
  nvidia: { baseURL: "https://integrate.api.nvidia.com/v1", defaultModel: "meta/llama-3.1-70b-instruct" },
  kimi: { baseURL: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k" },
  glm: { baseURL: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-4-plus" },
  google: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.0-flash" },
};

async function callAnthropic(systemPrompt: string, userPrompt: string, apiKey: string, model: string, maxTokens: number) {
  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: model || "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = msg.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

/**
 * Anthropic's SDK exposes `.stream()` returning an object that's directly
 * async-iterable over raw streaming events — no manual SSE parsing needed
 * on this branch, unlike the OpenAI-compatible one below where we're
 * talking to raw `fetch` and have to parse the wire format ourselves.
 * Only `content_block_delta` events of type `text_delta` carry visible
 * text; every other event type (message_start, content_block_start,
 * message_delta for stop_reason, message_stop) is metadata we don't need
 * to surface to the client for a plain-text script draft.
 */
async function* streamAnthropic(systemPrompt: string, userPrompt: string, apiKey: string, model: string, maxTokens: number): AsyncGenerator<string> {
  const anthropic = new Anthropic({ apiKey });
  const stream = anthropic.messages.stream({
    model: model || "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

/**
 * Manual SSE parsing against the OpenAI-compatible `stream: true` wire
 * format — every provider in OPENAI_COMPATIBLE_CONFIG speaks this same
 * shape (`data: {"choices":[{"delta":{"content":"..."}}]}` lines,
 * terminated by a literal `data: [DONE]`), so one parser covers all seven.
 * `res.body` is a byte stream, not a line stream, so chunks can split
 * mid-line — the `buffer` variable carries any incomplete trailing line
 * over to the next read rather than dropping or mis-parsing it.
 */
async function* streamOpenAICompatible(
  provider: Exclude<AIProvider, "anthropic">,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string,
): AsyncGenerator<string> {
  const { baseURL, defaultModel } = OPENAI_COMPATIBLE_CONFIG[provider];
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://forge2.app", "X-Title": "Forge 2" } : {}),
    },
    body: JSON.stringify({
      model: model || defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ProviderApiError(`${provider} API error [${res.status}]: ${text.slice(0, 500)}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // last element may be a partial line — hold it for the next chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Malformed/partial JSON on a single SSE line shouldn't kill the
        // whole stream — skip it and keep reading, same tolerance a
        // browser's own EventSource implementation would have.
      }
    }
  }
}

async function callOpenAICompatible(
  provider: Exclude<AIProvider, "anthropic">,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string,
  jsonMode: boolean,
) {
  const { baseURL, defaultModel } = OPENAI_COMPATIBLE_CONFIG[provider];
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://forge2.app", "X-Title": "Forge 2" } : {}),
    },
    body: JSON.stringify({
      model: model || defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderApiError(`${provider} API error [${res.status}]: ${text.slice(0, 500)}`, res.status);
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

/**
 * Resolves the workspace's saved BYOK key (decrypted server-side, never
 * sent to the client) or falls back to the server's own ANTHROPIC_API_KEY.
 * Mirrors Forge's "usingByok" branch in the SEO route, just reading from
 * Postgres instead of a request body.
 */
export async function resolveWorkspaceProvider(
  workspaceId: string,
): Promise<{ provider: AIProvider; apiKey: string; model: string }> {
  const [row] = await db
    .select()
    .from(workspaceAiSettings)
    .where(eq(workspaceAiSettings.workspaceId, workspaceId))
    .limit(1);

  if (row?.encryptedApiKey) {
    let apiKey: string;
    try {
      apiKey = decryptSecret(row.encryptedApiKey);
    } catch {
      throw new ProviderApiError("Failed to decrypt saved API key. Please reconnect your provider in Settings.", 500);
    }
    return {
      provider: row.provider as AIProvider,
      apiKey,
      model: row.model || "",
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ProviderApiError(
      "No API key available. Add one in Settings, or configure ANTHROPIC_API_KEY on the server.",
      500,
    );
  }
  return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model: "" };
}

/**
 * Generic entry point — pass any system/user prompt pair, get raw text
 * back. Used by script generation now; the same function is what
 * thumbnail-prompt generation and future AI features should call too,
 * rather than each module reimplementing provider dispatch.
 */
/**
 * Generic entry point — pass any system/user prompt pair, get raw text
 * back. Used by script generation now; the same function is what
 * thumbnail-prompt generation and future AI features should call too,
 * rather than each module reimplementing provider dispatch.
 */
export async function generateText(params: {
  workspaceId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const { provider, apiKey, model } = await resolveWorkspaceProvider(params.workspaceId);
  const maxTokens = params.maxTokens ?? 3000;

  if (provider === "anthropic") {
    return callAnthropic(params.systemPrompt, params.userPrompt, apiKey, model, maxTokens);
  }
  return callOpenAICompatible(provider, params.systemPrompt, params.userPrompt, apiKey, model, params.jsonMode ?? false);
}

/**
 * Streaming counterpart to generateText — same provider resolution, same
 * system/user prompt shape, but yields text deltas as they arrive instead
 * of returning the full string at once. Script generation is the first
 * caller (see /api/scripts/route.ts); jsonMode isn't supported here since
 * streaming + response_format:json_object together produce incremental
 * fragments of a JSON document, which isn't useful to show a user live —
 * callers that need structured streamed output should wait for
 * generateText's non-streaming jsonMode path instead.
 */
export async function* streamText(params: {
  workspaceId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const { provider, apiKey, model } = await resolveWorkspaceProvider(params.workspaceId);
  const maxTokens = params.maxTokens ?? 3000;

  if (provider === "anthropic") {
    yield* streamAnthropic(params.systemPrompt, params.userPrompt, apiKey, model, maxTokens);
    return;
  }
  yield* streamOpenAICompatible(provider, params.systemPrompt, params.userPrompt, apiKey, model);
}

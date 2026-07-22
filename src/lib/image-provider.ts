import "server-only";

/** Supported image-generation providers. Defaults to openai for backward compatibility. */
export type ImageProvider = "openai" | "google" | "nvidia";

/**
 * gpt-image-1 is OpenAI's current image model — unlike dall-e-2/3 it
 * always returns base64 (no url response_format option), which actually
 * suits us: we're uploading straight to R2 server-side anyway, so there's
 * no benefit to a temporary OpenAI-hosted URL we'd just have to fetch and
 * re-upload.
 */
async function generateOpenAIImage(apiKey: string, prompt: string): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      // 1536x1024 is the closest gpt-image-1 supports to YouTube's 16:9
      // thumbnail ratio (1280x720) — there's no exact match in its size
      // enum, so this is downscaled/cropped client-side if a person needs
      // the literal spec, not upscaled here.
      size: "1536x1024",
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI image API error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return Buffer.from(b64, "base64");
}

/**
 * Nvidia NIM — Stable Diffusion 3.5 Large hosted on Nvidia's inference
 * platform. Accepts an OpenAI-style bearer token (starts with "nvapi-")
 * and returns base64 image data in the same shape as other providers,
 * making the R2 upload step uniform across the board.
 */
async function generateNvidiaImage(apiKey: string, prompt: string): Promise<Buffer> {
  const res = await fetch("https://ai.api.nvidia.com/v1/vlm/stabilityai/stable-diffusion-3.5-large", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      cfg_scale: 5,
      aspect_ratio: "16:9",
      seed: 0,
      steps: 25,
      negative_prompt: "blurry, low quality, distorted, text artifacts, watermark",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nvidia NIM API error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const b64 = json.artifacts?.[0]?.base64;
  if (!b64) throw new Error("Nvidia NIM returned no image data.");
  return Buffer.from(b64, "base64");
}

/**
 * Gemini 2.0 Flash can generate images natively alongside text by setting
 * responseModalities to include "Image". The image comes back as an inline
 * base64-encoded part we can upload to R2 directly, same as the OpenAI path.
 */
async function generateGeminiImage(apiKey: string, prompt: string): Promise<Buffer> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }], role: "user" }],
        generationConfig: { responseModalities: ["Text", "Image"] },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini image API error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();

  for (const candidate of json.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData?.mimeType?.startsWith("image/")) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }
  }

  throw new Error("Gemini returned no image data.");
}

/**
 * Dispatches to the correct provider based on the workspace's setting.
 */
export async function generateImage(apiKey: string, prompt: string, provider: ImageProvider): Promise<Buffer> {
  if (provider === "google") return generateGeminiImage(apiKey, prompt);
  if (provider === "nvidia") return generateNvidiaImage(apiKey, prompt);
  return generateOpenAIImage(apiKey, prompt);
}

async function verifyNvidiaKey(apiKey: string): Promise<void> {
  const res = await fetch("https://health.api.nvidia.com", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  // Any authenticated response (even 4xx for a valid-key-on-invalid-endpoint)
  // means the key is real — only a 401/403 means it's fake.
  if (res.status === 401 || res.status === 403) throw new Error("Nvidia NIM rejected this key.");
}

async function verifyGeminiKey(apiKey: string): Promise<void> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey));
  if (!res.ok) throw new Error("Google/Gemini rejected this key.");
}

/** Cheap validation call — lists models rather than generating a real (billed) image just to check the key. */
async function verifyOpenAIImageKey(apiKey: string): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error("OpenAI rejected this key.");
}

export async function verifyImageKey(apiKey: string, provider: ImageProvider): Promise<void> {
  if (provider === "google") return verifyGeminiKey(apiKey);
  if (provider === "nvidia") return verifyNvidiaKey(apiKey);
  return verifyOpenAIImageKey(apiKey);
}

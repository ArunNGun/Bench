/**
 * Thin wrapper around an OpenAI-compatible /chat/completions endpoint.
 *
 * Works with any provider that speaks that API: OpenAI, Anthropic (via
 * proxy), Fuelix, Ollama, LM Studio, or anything else with the same shape.
 *
 * This is the one place in the app that makes a network call to a user-
 * configured external address. The call happens only when the user has entered
 * a URL in Settings and explicitly sends a message in the Assistant tab.
 * Nothing is sent automatically, and the endpoint is never hardcoded here.
 */

import type { AiConfig, AiMessage } from "../types";

/**
 * A file attached to a user message.
 *
 * Images are sent as OpenAI vision content (base64 data URL).
 * Text files are appended to the message text so they reach any model,
 * including those that do not support vision.
 */
export interface Attachment {
  name: string;
  /** "image" for pictures, "text" for plain-text files. */
  kind: "image" | "text";
  /** Data URL for images; raw text for text files. */
  data: string;
  mime: string;
}

export interface ChatRequest {
  config: AiConfig;
  systemPrompt: string;
  history: AiMessage[];
  userMessage: string;
  attachments?: Attachment[];
}

export interface ChatResult {
  ok: true;
  content: string;
}

export interface ChatError {
  ok: false;
  error: string;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Build the content array for the user turn, merging text and attachments. */
function buildUserContent(text: string, attachments: Attachment[]): string | ContentPart[] {
  const images = attachments.filter((a) => a.kind === "image");
  const textFiles = attachments.filter((a) => a.kind === "text");

  // Append text-file contents inline so they reach models without vision too.
  let fullText = text;
  for (const f of textFiles) {
    fullText += `\n\n--- Attached file: ${f.name} ---\n${f.data}\n--- End of ${f.name} ---`;
  }

  if (images.length === 0) return fullText;

  // At least one image: use the multipart content format.
  const parts: ContentPart[] = [{ type: "text", text: fullText }];
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: img.data } });
  }
  return parts;
}

export async function sendChat(req: ChatRequest): Promise<ChatResult | ChatError> {
  const { config, systemPrompt, history, userMessage, attachments = [] } = req;

  if (!config.url || !config.secret || !config.model) {
    return { ok: false, error: "AI assistant is not fully configured. Set the URL, key and model in Settings." };
  }

  const baseUrl = config.url.replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: buildUserContent(userMessage, attachments) },
  ];

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json() as { error?: { message?: string } };
        if (body?.error?.message) detail = body.error.message;
      } catch {
        // ignore
      }
      return { ok: false, error: detail };
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "The AI returned an empty response." };
    }

    return { ok: true, content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }
}

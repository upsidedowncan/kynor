"use server";

import OpenAI from "openai";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SUPPORTED_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
]);
const SAFE_FALLBACK_MODEL = "openai/gpt-oss-20b";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function chatCompletion(params: { model: string; messages: ChatMessage[] }) {
  if (!GROQ_API_KEY) {
    return { error: "GROQ_API_KEY is missing on server" };
  }

  const { model, messages } = params;
  const requestedModel = String(model);

  const client = new OpenAI({ apiKey: GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

  const cleanMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  async function run(modelId: string) {
    return client.chat.completions.create({
      model: modelId,
      messages: cleanMessages as any,
      temperature: 0.7,
    });
  }

  const primaryModel = SUPPORTED_MODELS.has(requestedModel) ? requestedModel : SAFE_FALLBACK_MODEL;

  try {
    const resp = await run(primaryModel);
    const message = resp.choices?.[0]?.message?.content ?? "";
    return { message: message || "", model: resp.model || primaryModel };
  } catch (e: any) {
    if (primaryModel !== SAFE_FALLBACK_MODEL) {
      try {
        const resp2 = await run(SAFE_FALLBACK_MODEL);
        const message2 = resp2.choices?.[0]?.message?.content ?? "";
        return { message: message2, model: resp2.model || SAFE_FALLBACK_MODEL, note: `fallback from ${primaryModel}` };
      } catch (e2: any) {
        return { error: e2?.message || "Groq(OpenAI) request failed" };
      }
    }
    return { error: e?.message || "Groq(OpenAI) request failed" };
  }
}



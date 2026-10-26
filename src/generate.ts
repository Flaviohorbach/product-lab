import { ProductCopySchema, productCopyJsonSchema, type ProductCopy } from "./copy-schema";
import { specSheet, type Product } from "./product";
import { render, type PromptTemplate } from "./prompts";
import { RetryableProviderError, type LlmProvider, type TokenUsage } from "./providers/types";

export interface GenerationResult {
  copy: ProductCopy | null;
  /** Why the final output was rejected, when `copy` is null. */
  error: string | null;
  /** Usage summed over every attempt: retries cost money too. */
  usage: TokenUsage;
  latencyMs: number;
  attempts: number;
}

export interface GenerateOptions {
  provider: LlmProvider;
  model: string;
  prompt: PromptTemplate;
  product: Product;
  image?: { mimeType: string; base64: string };
  /** Attempts when the answer does not pass schema validation. */
  maxAttempts?: number;
  /** Attempts when the provider is rate limited or overloaded. */
  maxTransientRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One product → one validated copy.
 *
 * Two different kinds of retry live here:
 *  - transient errors (429, 503): wait with exponential backoff and send the same request again;
 *  - invalid answers (bad JSON, a field over its limit): send the request again with the
 *    validation error appended, so the model knows exactly what to fix.
 */
export async function generateCopy(options: GenerateOptions): Promise<GenerationResult> {
  const { provider, model, prompt, product, image, maxAttempts = 2, maxTransientRetries = 4, sleep = defaultSleep } = options;
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };
  let latencyMs = 0;
  let feedback = "";
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userText = render(prompt.user, { specSheet: specSheet(product) }) + feedback;

    let response;
    for (let transient = 0; ; transient++) {
      try {
        response = await provider.generate({ model, system: prompt.system, userText, image, jsonSchema: productCopyJsonSchema });
        break;
      } catch (error) {
        if (!(error instanceof RetryableProviderError) || transient >= maxTransientRetries) throw error;
        await sleep(error.retryAfterMs ?? 2000 * 2 ** transient);
      }
    }

    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    usage.thoughtTokens += response.usage.thoughtTokens;
    latencyMs += response.latencyMs;

    const parsed = parseCopy(response.text);
    if (parsed.ok) return { copy: parsed.copy, error: null, usage, latencyMs, attempts: attempt };

    lastError = parsed.error;
    feedback =
      `\n\nSua resposta anterior foi rejeitada pela validação:\n${parsed.error}\n` +
      "Gere a resposta completa novamente, corrigindo esses pontos.";
  }

  return { copy: null, error: lastError, usage, latencyMs, attempts: maxAttempts };
}

export function parseCopy(text: string): { ok: true; copy: ProductCopy } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "A resposta não é um JSON válido." };
  }
  const result = ProductCopySchema.safeParse(json);
  if (result.success) return { ok: true, copy: result.data };
  return {
    ok: false,
    error: result.error.issues.map((issue) => `- ${issue.path.join(".") || "(raiz)"}: ${issue.message}`).join("\n"),
  };
}

import { GoogleGenAI } from "@google/genai";
import { QuotaExhaustedError, RetryableProviderError, type GenerateRequest, type GenerateResponse, type LlmProvider } from "./types";

const TIMEOUT_MS = 90_000;

/**
 * Gemini through the Interactions API (`client.interactions.create`), the
 * recommended API for new projects. Reads GEMINI_API_KEY from the environment.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.");
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const started = performance.now();
    try {
      const interaction = await this.client.interactions.create({
        model: request.model,
        system_instruction: request.system,
        input: [
          ...(request.image
            ? [{ type: "image" as const, mime_type: request.image.mimeType, data: request.image.base64 }]
            : []),
          { type: "text" as const, text: request.userText },
        ],
        response_format: { type: "text", mime_type: "application/json", schema: request.jsonSchema },
        // Interactions are stored server-side by default. Catalog data has no
        // reason to be kept by the provider, so opt out.
        store: false,
      }, {
        // Without a limit, a stuck request blocks the whole benchmark.
        timeout_ms: TIMEOUT_MS,
        // Retries are decided in generate.ts, which knows a 429 from a 403.
        // SDK retries on top of that would multiply the wait on errors that never recover.
        retries: { strategy: "none" },
      });

      const usage = interaction.usage ?? {};
      return {
        text: interaction.output_text ?? "",
        usage: {
          inputTokens: usage.total_input_tokens ?? 0,
          outputTokens: usage.total_output_tokens ?? 0,
          thoughtTokens: usage.total_thought_tokens ?? 0,
        },
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      const { status, body, name } = error as { status?: number; body?: string; name?: string };
      if (body?.includes("API_KEY_INVALID")) {
        throw new Error("GEMINI_API_KEY is not valid. Create a key at https://aistudio.google.com/apikey and put it in .env.");
      }
      if (status === 403) {
        // The key is valid but this model is not enabled for it (common on the free tier).
        throw new Error(`Model "${request.model}" is not available for this API key (403). Pick another model in src/models.ts.`);
      }
      if (/timeout|abort/i.test(`${name} ${(error as Error).message}`)) {
        throw new RetryableProviderError(`Gemini did not answer within ${TIMEOUT_MS / 1000} s`);
      }
      // A daily quota will not recover in seconds: retrying only burns more of tomorrow's.
      if (status === 429 && /per day/i.test((error as Error).message)) {
        throw new QuotaExhaustedError(request.model, (error as Error).message);
      }
      if (status === 429 || status === 500 || status === 503 || status === 504) {
        throw new RetryableProviderError(`Gemini returned ${status}: ${(error as Error).message}`);
      }
      throw error;
    }
  }
}

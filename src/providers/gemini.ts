import { GoogleGenAI } from "@google/genai";
import { RetryableProviderError, type GenerateRequest, type GenerateResponse, type LlmProvider } from "./types";

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
      const { status, body } = error as { status?: number; body?: string };
      if (body?.includes("API_KEY_INVALID")) {
        throw new Error("GEMINI_API_KEY is not valid. Create a key at https://aistudio.google.com/apikey and put it in .env.");
      }
      if (status === 429 || status === 500 || status === 503 || status === 504) {
        throw new RetryableProviderError(`Gemini returned ${status}: ${(error as Error).message}`);
      }
      throw error;
    }
  }
}

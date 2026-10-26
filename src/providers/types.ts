/**
 * The contract every LLM provider adapter implements. The rest of the app
 * (generation, retries, checks, benchmark) only talks to this interface, so
 * adding Claude or OpenAI later means writing one new adapter file.
 */
export interface GenerateRequest {
  model: string;
  system: string;
  userText: string;
  image?: { mimeType: string; base64: string };
  /** JSON Schema the response must follow. */
  jsonSchema: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Reasoning tokens. Not visible in the answer, but billed as output. */
  thoughtTokens: number;
}

export interface GenerateResponse {
  text: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: string;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}

/** Thrown by adapters for errors worth retrying later (rate limit, overload, timeout). */
export class RetryableProviderError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

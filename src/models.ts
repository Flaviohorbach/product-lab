/**
 * Models compared in the benchmark, with paid-tier prices in USD per 1M tokens.
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-10-26).
 * All of these have a free tier, so the benchmark itself costs nothing; the
 * prices answer "what would this cost in production, without the free limits?".
 * Prices change often: update this table and its date before trusting old results.
 */
export interface ModelInfo {
  id: string;
  provider: "gemini";
  label: string;
  inputPerMillion: number;
  /** Also applies to thinking tokens. */
  outputPerMillion: number;
}

export const PRICES_CHECKED_ON = "2026-10-26";

export const MODELS: ModelInfo[] = [
  { id: "gemini-3.8-flash", provider: "gemini", label: "Gemini 3.8 Flash", inputPerMillion: 0.75, outputPerMillion: 3.75 },
  { id: "gemini-3.5-flash-lite", provider: "gemini", label: "Gemini 3.5 Flash-Lite", inputPerMillion: 0.3, outputPerMillion: 2.5 },
  { id: "gemini-3.1-flash-lite", provider: "gemini", label: "Gemini 3.1 Flash-Lite", inputPerMillion: 0.25, outputPerMillion: 1.5 },
];

export function findModel(id: string): ModelInfo {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model "${id}". Known: ${MODELS.map((m) => m.id).join(", ")}`);
  return model;
}

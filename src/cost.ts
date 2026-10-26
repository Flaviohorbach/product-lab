import type { ModelInfo } from "./models";
import type { TokenUsage } from "./providers/types";

/** Cost of one call in USD. Thinking tokens are billed at the output price. */
export function callCost(usage: TokenUsage, model: ModelInfo): number {
  return (
    (usage.inputTokens * model.inputPerMillion + (usage.outputTokens + usage.thoughtTokens) * model.outputPerMillion) /
    1_000_000
  );
}

/** The number a business cares about: what it costs to write copy for 1,000 products. */
export const costPerThousand = (averageCallCost: number) => averageCallCost * 1000;

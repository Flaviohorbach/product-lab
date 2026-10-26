import { parseArgs } from "node:util";
import { runChecks } from "../checks";
import { callCost } from "../cost";
import { loadEnv } from "../env";
import { generateCopy, type GenerationResult } from "../generate";
import { loadImage } from "../images";
import { findModel } from "../models";
import { loadProducts } from "../product";
import { loadPrompt } from "../prompts";
import { GeminiProvider } from "../providers/gemini";

// Usage: npm run generate -- --product liquidificador-compacto --model gemini-3.8-flash --prompt v2-grounded
loadEnv();
const { values } = parseArgs({
  options: {
    product: { type: "string", default: "liquidificador-compacto" },
    model: { type: "string", default: "gemini-3.8-flash" },
    prompt: { type: "string", default: "v2-grounded" },
  },
});

const products = await loadProducts();
const product = products.find((p) => p.id === values.product);
if (!product) throw new Error(`Product "${values.product}" not found. Ids: ${products.map((p) => p.id).join(", ")}`);
const model = findModel(values.model);

let result: GenerationResult | null = null;
try {
  result = await generateCopy({
    provider: new GeminiProvider(),
    model: model.id,
    prompt: await loadPrompt(values.prompt),
    product,
    image: await loadImage(product.imageUrl),
  });
} catch (error) {
  console.error((error as Error).message);
}

// Exit codes via process.exitCode, not process.exit(): exiting abruptly while
// HTTP connections are still open crashes Node on Windows.
if (!result) {
  process.exitCode = 1;
} else if (!result.copy) {
  console.error(`Rejected after ${result.attempts} attempts:\n${result.error}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result.copy, null, 2));
  console.log("\nChecks:");
  for (const check of runChecks(result.copy, product)) {
    console.log(`  ${check.passed ? "✓" : "✗"} ${check.id}${check.detail ? `  (${check.detail})` : ""}`);
  }
  const { inputTokens, outputTokens, thoughtTokens } = result.usage;
  console.log(
    `\n${model.label} · ${values.prompt} · ${result.latencyMs} ms · ${result.attempts} attempt(s)` +
      `\nTokens: ${inputTokens} in, ${outputTokens} out, ${thoughtTokens} thinking · cost US$ ${callCost(result.usage, model).toFixed(6)}`,
  );
}

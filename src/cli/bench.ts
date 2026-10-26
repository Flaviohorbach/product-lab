import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { runChecks, summarize, summaryMarkdown, toRecord, type RunRecord } from "../bench";
import { loadEnv } from "../env";
import { generateCopy } from "../generate";
import { loadImage } from "../images";
import { MODELS, PRICES_CHECKED_ON, findModel } from "../models";
import { loadProducts } from "../product";
import { listPromptVersions, loadPrompt } from "../prompts";
import { GeminiProvider } from "../providers/gemini";

// Usage: npm run bench -- [--models a,b] [--prompts v1-baseline,v2-grounded] [--limit 4] [--delay 4000]
loadEnv();
const { values } = parseArgs({
  options: {
    models: { type: "string", default: MODELS.map((m) => m.id).join(",") },
    prompts: { type: "string" },
    limit: { type: "string" },
    // The free tier allows only a few requests per minute; spacing calls avoids most 429s.
    delay: { type: "string", default: "4000" },
  },
});

const models = values.models.split(",").map(findModel);
const prompts = await Promise.all((values.prompts?.split(",") ?? (await listPromptVersions())).map((v) => loadPrompt(v)));
const products = (await loadProducts()).slice(0, values.limit ? Number(values.limit) : undefined);
const delay = Number(values.delay);
const provider = new GeminiProvider();

const total = models.length * prompts.length * products.length;
console.log(`Running ${total} generations: ${models.length} models × ${prompts.length} prompts × ${products.length} products\n`);

const records: RunRecord[] = [];
let aborted = false;
outer: for (const model of models) {
  for (const prompt of prompts) {
    for (const product of products) {
      const n = records.length + 1;
      process.stdout.write(`[${n}/${total}] ${model.id} · ${prompt.version} · ${product.id} … `);
      try {
        const result = await generateCopy({ provider, model: model.id, prompt, product, image: await loadImage(product.imageUrl) });
        const checks = result.copy ? runChecks(result.copy, product) : [];
        records.push(toRecord({ model: model.id, prompt: prompt.version, product: product.id, ...result }, model, checks));
        const failed = checks.filter((c) => !c.passed).map((c) => c.id);
        console.log(result.copy ? (failed.length ? `✗ ${failed.join(", ")}` : "✓") : `invalid: ${result.error}`);
      } catch (error) {
        // A bad key fails every call the same way: stop instead of burning through the whole grid.
        if ((error as Error).message.startsWith("GEMINI_API_KEY")) {
          console.log(`\n${(error as Error).message}`);
          aborted = true;
          break outer;
        }
        // Other hard failures (e.g. a model that is not available) are recorded and the run continues.
        records.push(
          toRecord(
            {
              model: model.id, prompt: prompt.version, product: product.id, copy: null, error: (error as Error).message,
              usage: { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }, latencyMs: 0, attempts: 0,
            },
            model,
            [],
          ),
        );
        console.log(`error: ${(error as Error).message}`);
      }
      if (n < total) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

if (aborted) {
  process.exitCode = 1;
} else {
  const date = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const markdown = summaryMarkdown(summarize(records), { date, products: products.length, pricesCheckedOn: PRICES_CHECKED_ON });

  await mkdir("results", { recursive: true });
  await writeFile(`results/${stamp}.json`, JSON.stringify(records, null, 2));
  await writeFile(`results/${stamp}.md`, markdown);
  await writeFile("results/latest.md", markdown);
  console.log(`\n${markdown}\nSaved results/${stamp}.json and results/latest.md`);
}

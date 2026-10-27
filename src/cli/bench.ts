import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { runChecks, summarize, summaryMarkdown, toRecord, type RunRecord } from "../bench";
import { loadEnv } from "../env";
import { generateCopy } from "../generate";
import { loadImage } from "../images";
import { MODELS, PRICES_CHECKED_ON, findModel } from "../models";
import { loadProducts } from "../product";
import { listPromptVersions, loadPrompt } from "../prompts";
import { GeminiProvider } from "../providers/gemini";
import { QuotaExhaustedError, RetryableProviderError } from "../providers/types";
import { CircuitBreaker } from "../circuit-breaker";

// Usage: npm run bench -- [--models a,b] [--prompts v1-baseline,v2-grounded] [--limit 4] [--delay 6000] [--fresh]
//
// Resumable: every result is saved to results/progress.json as soon as it arrives,
// and a new run skips what is already there. The free tier allows ~20 requests per
// model per day, so a full grid (36 per model) is meant to be completed over days.
loadEnv();
const { values } = parseArgs({
  options: {
    models: { type: "string", default: MODELS.map((m) => m.id).join(",") },
    prompts: { type: "string" },
    limit: { type: "string" },
    // The free tier also limits requests per minute; spacing calls avoids most 429s.
    delay: { type: "string", default: "6000" },
    fresh: { type: "boolean", default: false },
    // Re-score saved outputs and rewrite the summary without calling the model.
    "dry-run": { type: "boolean", default: false },
  },
});

const PROGRESS = "results/progress.json";
const models = values.models.split(",").map(findModel);
const prompts = await Promise.all((values.prompts?.split(",") ?? (await listPromptVersions())).map((v) => loadPrompt(v)));
const products = (await loadProducts()).slice(0, values.limit ? Number(values.limit) : undefined);
const delay = Number(values.delay);
const provider = new GeminiProvider();

let records: RunRecord[] = [];
if (!values.fresh) {
  try {
    records = JSON.parse(await readFile(PROGRESS, "utf8"));
  } catch {
    // First run: no progress file yet.
  }
}
// Checks are re-run on every saved output, so improving a check (or fixing a false
// positive) updates old results for free, with no new API calls.
const catalog = new Map((await loadProducts()).map((p) => [p.id, p]));
records = records.map((r) => (r.copy ? { ...r, checks: runChecks(r.copy, catalog.get(r.product)!) } : r));

const key = (model: string, prompt: string, product: string) => `${model}|${prompt}|${product}`;
const done = new Set(records.map((r) => key(r.model, r.prompt, r.product)));

const todo = values["dry-run"]
  ? []
  : models.flatMap((model) =>
      products.flatMap((product) => prompts.map((prompt) => ({ model, product, prompt }))),
    ).filter(({ model, prompt, product }) => !done.has(key(model.id, prompt.version, product.id)));

console.log(`${done.size} results already saved, ${todo.length} to run.\n`);
await mkdir("results", { recursive: true });

const exhausted = new Set<string>();
// Three items in a row failing with overload or timeout: treat the model as down for this run.
const breaker = new CircuitBreaker(3);
let aborted = false;
for (const [i, { model, prompt, product }] of todo.entries()) {
  if (exhausted.has(model.id) || breaker.isOpen(model.id)) continue;
  process.stdout.write(`[${i + 1}/${todo.length}] ${model.id} · ${prompt.version} · ${product.id} … `);
  try {
    const result = await generateCopy({ provider, model: model.id, prompt, product, image: await loadImage(product.imageUrl) });
    const checks = result.copy ? runChecks(result.copy, product) : [];
    // Invalid answers are a real result (the model failed the task), so they are saved too.
    records.push(toRecord({ model: model.id, prompt: prompt.version, product: product.id, ...result }, model, checks));
    await writeFile(PROGRESS, JSON.stringify(records, null, 2));
    breaker.recordSuccess(model.id);
    const failed = checks.filter((c) => !c.passed).map((c) => c.id);
    console.log(result.copy ? (failed.length ? `✗ ${failed.join(", ")}` : "✓") : `invalid: ${result.error}`);
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("GEMINI_API_KEY")) {
      console.log(`\n${message}`);
      aborted = true;
      break;
    }
    if (error instanceof QuotaExhaustedError) {
      exhausted.add(model.id);
      console.log(`daily quota used up, skipping ${model.id} for today`);
      continue;
    }
    // Overload that outlasted the retries, a model not enabled for the key...
    // Not saved, so the next run tries it again.
    console.log(`error: ${message}`);
    if (error instanceof RetryableProviderError && breaker.recordFailure(model.id)) {
      console.log(`${model.id} failed 3 items in a row: skipping it for this run. Try it again later.`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, delay));
}

if (aborted) {
  process.exitCode = 1;
} else {
  const date = new Date().toISOString().slice(0, 10);
  const markdown = summaryMarkdown(summarize(records), { date, pricesCheckedOn: PRICES_CHECKED_ON });
  await writeFile("results/latest.md", markdown);

  const remaining = todo.length - (records.length - done.size);
  console.log(`\n${markdown}\nSaved ${PROGRESS} and results/latest.md.`);
  if (remaining > 0) console.log(`${remaining} combinations still missing: run \`npm run bench\` again later to continue.`);
}

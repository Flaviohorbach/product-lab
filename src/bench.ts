import { runChecks, type CheckResult } from "./checks";
import type { ProductCopy } from "./copy-schema";
import { callCost, costPerThousand } from "./cost";
import type { ModelInfo } from "./models";
import type { TokenUsage } from "./providers/types";

/** One model × prompt × product run, as stored in results/*.json. */
export interface RunRecord {
  model: string;
  prompt: string;
  product: string;
  copy: ProductCopy | null;
  error: string | null;
  checks: CheckResult[];
  usage: TokenUsage;
  costUSD: number;
  latencyMs: number;
  attempts: number;
}

export interface Summary {
  model: string;
  prompt: string;
  runs: number;
  /** Share of runs that produced schema-valid output (after retries). */
  validRate: number;
  /** Share of runs where every check passed. */
  cleanRate: number;
  failuresByCheck: Record<string, number>;
  avgLatencyMs: number;
  avgOutputTokens: number;
  costPer1000USD: number;
}

export function toRecord(
  base: Pick<RunRecord, "model" | "prompt" | "product" | "copy" | "error" | "usage" | "latencyMs" | "attempts">,
  model: ModelInfo,
  checks: CheckResult[],
): RunRecord {
  return { ...base, checks, costUSD: callCost(base.usage, model) };
}

export { runChecks };

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function summarize(records: RunRecord[]): Summary[] {
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    const key = `${record.model}|${record.prompt}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.values()].map((group) => {
    const failuresByCheck: Record<string, number> = {};
    for (const record of group) {
      for (const check of record.checks) if (!check.passed) failuresByCheck[check.id] = (failuresByCheck[check.id] ?? 0) + 1;
    }
    const valid = group.filter((r) => r.copy);
    return {
      model: group[0]!.model,
      prompt: group[0]!.prompt,
      runs: group.length,
      validRate: valid.length / group.length,
      cleanRate: valid.filter((r) => r.checks.every((c) => c.passed)).length / group.length,
      failuresByCheck,
      avgLatencyMs: average(group.map((r) => r.latencyMs)),
      avgOutputTokens: average(group.map((r) => r.usage.outputTokens + r.usage.thoughtTokens)),
      costPer1000USD: costPerThousand(average(group.map((r) => r.costUSD))),
    };
  });
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function summaryMarkdown(summaries: Summary[], meta: { date: string; products: number; pricesCheckedOn: string }): string {
  const rows = [...summaries]
    .sort((a, b) => b.cleanRate - a.cleanRate || a.costPer1000USD - b.costPer1000USD)
    .map((s) => {
      const failures = Object.entries(s.failuresByCheck).map(([id, n]) => `${id} ×${n}`).join(", ") || "–";
      return `| ${s.model} | ${s.prompt} | ${pct(s.validRate)} | ${pct(s.cleanRate)} | ${failures} | ${(s.avgLatencyMs / 1000).toFixed(1)} s | ${Math.round(s.avgOutputTokens)} | $${s.costPer1000USD.toFixed(2)} |`;
    });

  return [
    `Benchmark of ${meta.date}: ${meta.products} products per row. Prices checked on ${meta.pricesCheckedOn}.`,
    "",
    "| Model | Prompt | Valid | All checks pass | Failed checks | Avg latency | Output tokens | Cost / 1,000 products |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

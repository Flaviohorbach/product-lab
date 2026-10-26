import { describe, expect, it } from "vitest";
import { summarize, type RunRecord } from "../src/bench";
import { productCopyJsonSchema } from "../src/copy-schema";
import { callCost } from "../src/cost";
import { findModel } from "../src/models";
import { loadProducts, specSheet } from "../src/product";
import { listPromptVersions, loadPrompt, render } from "../src/prompts";
import { blender } from "./helpers";

describe("prompt files", () => {
  it("every version parses and uses the spec sheet", async () => {
    const versions = await listPromptVersions();
    expect(versions.length).toBeGreaterThanOrEqual(3);
    for (const version of versions) {
      const prompt = await loadPrompt(version);
      expect(prompt.system.length).toBeGreaterThan(0);
      expect(prompt.user).toContain("{{specSheet}}");
    }
  });

  it("fails loudly on a missing placeholder value", () => {
    expect(() => render("{{specSheet}} {{other}}", { specSheet: "x" })).toThrow("{{other}}");
  });
});

describe("catalog", () => {
  it("loads and renders every product", async () => {
    const products = await loadProducts();
    expect(products).toHaveLength(12);
    expect(specSheet(products[0]!)).toContain("Nome: Espátula de Bambu");
    expect(specSheet(blender)).toContain("Preço: R$ 189,90");
  });
});

describe("schema sent to the API", () => {
  it("is a JSON Schema object with every field required", () => {
    expect(productCopyJsonSchema.type).toBe("object");
    expect(productCopyJsonSchema.required).toEqual(
      expect.arrayContaining(["title", "shortDescription", "longDescription", "highlights", "seo", "missingInfo"]),
    );
  });
});

describe("cost", () => {
  it("bills thinking tokens at the output price", () => {
    const model = findModel("gemini-3.8-flash"); // $0.75 in, $3.75 out per 1M
    const cost = callCost({ inputTokens: 1_000_000, outputTokens: 500_000, thoughtTokens: 500_000 }, model);
    expect(cost).toBeCloseTo(0.75 + 3.75);
  });

  it("summarizes valid and clean rates per model and prompt", () => {
    const base = { model: "m", prompt: "p", error: null, usage: { inputTokens: 0, outputTokens: 10, thoughtTokens: 0 }, costUSD: 0.001, latencyMs: 1000, attempts: 1 };
    const records: RunRecord[] = [
      { ...base, product: "a", copy: {} as never, checks: [{ id: "x", passed: true }] },
      { ...base, product: "b", copy: {} as never, checks: [{ id: "x", passed: false }] },
      { ...base, product: "c", copy: null, error: "bad", checks: [] },
      { ...base, product: "d", copy: {} as never, checks: [{ id: "x", passed: true }] },
    ];
    const [summary] = summarize(records);
    expect(summary).toMatchObject({ runs: 4, validRate: 0.75, cleanRate: 0.5, failuresByCheck: { x: 1 }, costPer1000USD: 1 });
  });
});

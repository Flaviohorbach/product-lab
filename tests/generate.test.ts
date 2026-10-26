import { describe, expect, it } from "vitest";
import { generateCopy, parseCopy } from "../src/generate";
import { parsePrompt } from "../src/prompts";
import { QuotaExhaustedError, RetryableProviderError } from "../src/providers/types";
import { FakeProvider, blender, goodCopy } from "./helpers";

const prompt = parsePrompt("test", "# system\nVocê é um redator.\n# user\n{{specSheet}}");
const noSleep = async () => {};
const run = (provider: FakeProvider) => generateCopy({ provider, model: "fake-model", prompt, product: blender, sleep: noSleep });

describe("generateCopy", () => {
  it("returns validated copy on the first valid answer", async () => {
    const provider = new FakeProvider([JSON.stringify(goodCopy)]);
    const result = await run(provider);
    expect(result.copy).toEqual(goodCopy);
    expect(result.attempts).toBe(1);
    expect(provider.requests[0]!.userText).toContain("Potência: 600 W");
  });

  it("retries an invalid answer and tells the model what was wrong", async () => {
    const tooLong = { ...goodCopy, title: "x".repeat(80) };
    const provider = new FakeProvider([JSON.stringify(tooLong), JSON.stringify(goodCopy)]);
    const result = await run(provider);

    expect(result.copy).toEqual(goodCopy);
    expect(result.attempts).toBe(2);
    expect(provider.requests[1]!.userText).toContain("- title:");
    // Both attempts are billed.
    expect(result.usage).toEqual({ inputTokens: 2000, outputTokens: 800, thoughtTokens: 200 });
  });

  it("gives up after the attempt limit and reports the last error", async () => {
    const provider = new FakeProvider(["not json", "still not json"]);
    const result = await run(provider);
    expect(result.copy).toBeNull();
    expect(result.error).toContain("JSON");
  });

  it("waits and resends the same request on rate limits", async () => {
    const provider = new FakeProvider([new RetryableProviderError("429"), JSON.stringify(goodCopy)]);
    const result = await run(provider);
    expect(result.copy).toEqual(goodCopy);
    expect(result.attempts).toBe(1);
    expect(provider.requests).toHaveLength(2);
  });

  it("does not retry a used-up daily quota, so it does not burn more of it", async () => {
    const provider = new FakeProvider([new QuotaExhaustedError("fake-model", "20 requests per day"), JSON.stringify(goodCopy)]);
    await expect(run(provider)).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(provider.requests).toHaveLength(1);
  });

  it("does not retry errors that will not go away", async () => {
    const provider = new FakeProvider([new Error("invalid API key")]);
    await expect(run(provider)).rejects.toThrow("invalid API key");
  });
});

describe("parseCopy", () => {
  it("lists every schema problem with its path", () => {
    const result = parseCopy(JSON.stringify({ ...goodCopy, highlights: ["só um"] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("highlights");
  });
});
